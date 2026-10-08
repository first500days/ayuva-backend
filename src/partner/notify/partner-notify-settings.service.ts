import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { StaffRole } from '../rbac/partner-permissions';
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
    const { rules, settings } = await this.notifier.rulesFor(providerId);
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
    };
  }

  async update(
    providerId: Types.ObjectId,
    input: {
      rules?: NotificationRuleInput[];
      webhook?: { enabled?: boolean; url?: string };
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

    await settings.save();
    return this.get(providerId);
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
