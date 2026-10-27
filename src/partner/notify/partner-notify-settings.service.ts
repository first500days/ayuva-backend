import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { OrgType, StaffRole, orgTypeOf } from '../rbac/partner-permissions';
import {
  PartnerNotificationSettings,
  PartnerNotificationSettingsDocument,
} from './schemas/partner-notification-settings.schema';
import {
  PartnerWebhookDelivery,
  PartnerWebhookDeliveryDocument,
} from './schemas/partner-webhook-delivery.schema';
import { PartnerNotifierService } from './partner-notifier.service';
import {
  CapacityRuleConfig,
  DEFAULT_CAPACITY_RULES,
  PartnerTrigger,
  TRIGGER_CATALOG,
  feedTrigger,
} from './partner-triggers';
import { assertSafeWebhookUrl } from './webhook-url';

export interface NotificationRuleInput {
  trigger: PartnerTrigger;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  desktop: boolean;
  webhook: boolean;
  roles: StaffRole[];
}

/** Notification Center configuration: the trigger × channel matrix and the webhook endpoint. */
@Injectable()
export class PartnerNotifySettingsService {
  constructor(
    @InjectModel(PartnerNotificationSettings.name)
    private readonly settingsModel: Model<PartnerNotificationSettingsDocument>,
    @InjectModel(PartnerWebhookDelivery.name)
    private readonly deliveryModel: Model<PartnerWebhookDeliveryDocument>,
    private readonly notifier: PartnerNotifierService,
    private readonly config: ConfigService,
  ) {}

  async get(providerId: Types.ObjectId) {
    const { rules, settings, provider } =
      await this.notifier.rulesFor(providerId);
    const orgType = provider ? orgTypeOf(provider.type) : undefined;
    const hospital = orgType === OrgType.HOSPITAL;
    return {
      rules: rules.map((r) => {
        const def = TRIGGER_CATALOG.find((d) => d.trigger === r.trigger)!;
        return {
          ...r,
          label: def.label,
          description: def.description,
          critical: def.critical,
        };
      }),
      webhook: {
        enabled: settings?.webhook?.enabled ?? false,
        url: settings?.webhook?.url ?? '',
        // Shown to admins so their receiver can verify signatures.
        secret: settings?.webhook?.secret ?? null,
      },
      capacityRules: hospital
        ? (settings?.capacityRules ?? DEFAULT_CAPACITY_RULES).map((r) => ({
            id: r.id,
            scope: r.scope,
            thresholdPercent: r.thresholdPercent,
            enabled: r.enabled,
          }))
        : [],
      // Labs only: alert the moment a critical value is entered (null elsewhere).
      criticalOnEntry:
        orgType === OrgType.DIAGNOSTIC
          ? (settings?.criticalOnEntry ?? true)
          : null,
    };
  }

  async update(
    providerId: Types.ObjectId,
    input: {
      rules?: NotificationRuleInput[];
      webhook?: { enabled?: boolean; url?: string };
      capacityRules?: CapacityRuleConfig[];
      criticalOnEntry?: boolean;
    },
  ) {
    const settings =
      (await this.settingsModel.findOne({ providerId })) ??
      new this.settingsModel({ providerId, rules: [], webhook: {} });

    if (input.rules) {
      const known = new Set(TRIGGER_CATALOG.map((d) => d.trigger));
      const byTrigger = new Map(settings.rules.map((r) => [r.trigger, r]));
      for (const r of input.rules) {
        if (!known.has(r.trigger))
          throw new BadRequestException(`Unknown trigger ${r.trigger}`);
        byTrigger.set(r.trigger, {
          trigger: r.trigger,
          inApp: r.inApp,
          email: r.email,
          sms: r.sms,
          desktop: r.desktop,
          webhook: r.webhook,
          roles: [...new Set(r.roles)],
        });
      }
      settings.rules = [...byTrigger.values()];
      settings.markModified('rules');
    }

    if (input.webhook) {
      const url = input.webhook.url?.trim();
      if (url !== undefined) {
        if (url) await assertSafeWebhookUrl(url, this.allowPrivateHosts());
        settings.webhook.url = url || undefined;
      }
      if (input.webhook.enabled !== undefined)
        settings.webhook.enabled = input.webhook.enabled;
      if (settings.webhook.enabled && !settings.webhook.url) {
        throw new BadRequestException(
          'Add a webhook URL before enabling webhooks',
        );
      }
      if (!settings.webhook.secret) settings.webhook.secret = this.newSecret();
      settings.markModified('webhook');
    }

    if (input.capacityRules) {
      const ids = input.capacityRules.map((r) => r.id);
      if (new Set(ids).size !== ids.length)
        throw new BadRequestException('Each capacity rule needs its own id');
      const previous = new Map(
        (settings.capacityRules ?? DEFAULT_CAPACITY_RULES).map((r) => [
          r.id,
          r,
        ]),
      );
      const unchanged = new Set(
        input.capacityRules
          .filter((r) => {
            const p = previous.get(r.id);
            return (
              !!p &&
              p.scope === r.scope &&
              p.thresholdPercent === r.thresholdPercent &&
              p.enabled === r.enabled
            );
          })
          .map((r) => r.id),
      );
      settings.capacityRules = input.capacityRules.map((r) => ({
        id: r.id,
        scope: r.scope,
        thresholdPercent: r.thresholdPercent,
        enabled: r.enabled,
      }));
      // New or changed rules re-arm, so a ward already over a new level alerts on the
      // next check; unchanged rules keep their state and don't repeat themselves.
      settings.capacityAlerts = (settings.capacityAlerts ?? []).filter((a) =>
        unchanged.has(a.key.split('|')[0] ?? ''),
      );
      settings.markModified('capacityRules');
      settings.markModified('capacityAlerts');
    }

    if (input.criticalOnEntry !== undefined)
      settings.criticalOnEntry = input.criticalOnEntry;

    await settings.save();
    return this.get(providerId);
  }

  /** Whether a lab is alerted the moment a critical value is entered (on unless switched off). */
  async criticalOnEntry(providerId: Types.ObjectId): Promise<boolean> {
    const s = await this.settingsModel
      .findOne({ providerId })
      .select('criticalOnEntry')
      .lean()
      .exec();
    return s?.criticalOnEntry ?? true;
  }

  /** Capacity rules in force, and the rule scopes that have already alerted. */
  async capacityState(providerId: Types.ObjectId): Promise<{
    rules: CapacityRuleConfig[];
    alerting: Set<string>;
  }> {
    const s = await this.settingsModel
      .findOne({ providerId })
      .select('capacityRules capacityAlerts')
      .lean()
      .exec();
    return {
      rules: s?.capacityRules ?? DEFAULT_CAPACITY_RULES,
      alerting: new Set((s?.capacityAlerts ?? []).map((a) => a.key)),
    };
  }

  /**
   * Marks a rule scope as alerting. Resolves true only for the caller that
   * made the change, so two admissions at once can't send the same alert twice.
   */
  async markCapacityAlert(
    providerId: Types.ObjectId,
    key: string,
  ): Promise<boolean> {
    await this.settingsModel
      .updateOne(
        { providerId },
        { $setOnInsert: { providerId } },
        { upsert: true },
      )
      .catch(() => undefined); // a concurrent upsert won the unique index
    const res = await this.settingsModel.updateOne(
      { providerId, 'capacityAlerts.key': { $ne: key } },
      { $push: { capacityAlerts: { key, at: new Date() } } },
    );
    return res.modifiedCount === 1;
  }

  /** Re-arms rule scopes that are back under their threshold. */
  async clearCapacityAlerts(providerId: Types.ObjectId, keys: string[]) {
    if (!keys.length) return;
    await this.settingsModel.updateOne(
      { providerId },
      { $pull: { capacityAlerts: { key: { $in: keys } } } },
    );
  }

  async rotateSecret(providerId: Types.ObjectId) {
    await this.settingsModel.updateOne(
      { providerId },
      { $set: { 'webhook.secret': this.newSecret() } },
      { upsert: true },
    );
    return this.get(providerId);
  }

  async deliveries(providerId: Types.ObjectId) {
    const rows = await this.deliveryModel
      .find({ providerId })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    return rows.map((d) => ({
      id: d.id,
      eventId: d.eventId,
      trigger: d.trigger,
      url: d.url,
      statusCode: d.statusCode ?? null,
      ok: d.ok,
      error: d.error ?? null,
      durationMs: d.durationMs,
      test: d.test,
      createdAt: (d.createdAt ?? new Date()).toISOString(),
    }));
  }

  async sendTest(providerId: Types.ObjectId) {
    const d = await this.notifier.sendTest(providerId);
    return {
      id: d.id,
      ok: d.ok,
      statusCode: d.statusCode ?? null,
      error: d.error ?? null,
      durationMs: d.durationMs,
    };
  }

  /** Feed trigger names (partner_*) this member's portal should raise a desktop alert for. */
  async desktopTriggers(
    providerId: Types.ObjectId,
    role: StaffRole,
  ): Promise<string[]> {
    const { rules } = await this.notifier.rulesFor(providerId);
    return rules
      .filter((r) => r.desktop && r.roles.includes(role))
      .map((r) => feedTrigger(r.trigger));
  }

  private newSecret(): string {
    return `whsec_${randomBytes(24).toString('hex')}`;
  }

  private allowPrivateHosts(): boolean {
    return this.config.get<string>('nodeEnv') !== 'production';
  }
}
