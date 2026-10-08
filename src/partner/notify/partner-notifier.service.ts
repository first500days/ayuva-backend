import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, randomUUID } from 'node:crypto';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import { SMS_SENDER } from '../../notifications/sms/sms-sender';
import type { SmsSender } from '../../notifications/sms/sms-sender';
import { MailService } from '../../mail/mail.service';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import { orgTypeOf } from '../rbac/partner-permissions';
import {
  PartnerNotificationSettings,
  PartnerNotificationSettingsDocument,
} from './schemas/partner-notification-settings.schema';
import {
  PartnerWebhookDelivery,
  PartnerWebhookDeliveryDocument,
} from './schemas/partner-webhook-delivery.schema';
import {
  PartnerTrigger,
  TRIGGER_CATALOG,
  TriggerDefinition,
  feedTrigger,
} from './partner-triggers';
import { assertSafeWebhookUrl } from './webhook-url';

export interface PartnerEvent {
  trigger: PartnerTrigger;
  /** Portal feed title, e.g. "New booking request". */
  title: string;
  /** Portal feed detail. Shown only inside the authenticated portal, so it may name the patient. */
  message: string;
  /** When set, "{patient}" in title/message is replaced with the patient's name (portal feed only). */
  patientId?: string;
  /** Email/SMS text. Leaves the platform, so it must carry no patient-identifying detail. */
  safeMessage?: string;
  /** Portal route the notification opens, e.g. /partner/appointments. */
  route: string;
  params?: Record<string, string>;
  /** Webhook payload — ids and statuses, never clinical content. */
  data?: Record<string, unknown>;
  /** Always notified when active (e.g. the assigned doctor), on top of the rule's roles. */
  memberIds?: string[];
  /** The member who caused the event doesn't need telling. */
  excludeUserId?: string;
}

export interface ResolvedRule {
  trigger: PartnerTrigger;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  desktop: boolean;
  webhook: boolean;
  roles: string[];
}

const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * Notification Center dispatcher. Every call is best-effort: it never throws,
 * so a failed email, SMS or webhook can never fail the booking, referral or
 * report release that raised the event.
 */
@Injectable()
export class PartnerNotifierService {
  private readonly logger = new Logger(PartnerNotifierService.name);

  constructor(
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(PartnerNotificationSettings.name)
    private readonly settingsModel: Model<PartnerNotificationSettingsDocument>,
    @InjectModel(PartnerWebhookDelivery.name)
    private readonly deliveryModel: Model<PartnerWebhookDeliveryDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly notifications: AppNotificationsService,
    private readonly mail: MailService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly config: ConfigService,
  ) {}

  async emit(
    providerId: Types.ObjectId | string | undefined | null,
    event: PartnerEvent,
  ): Promise<void> {
    if (!providerId) return;
    try {
      await this.dispatch(new Types.ObjectId(providerId), event);
    } catch (err) {
      this.logger.error(
        `Partner notification ${event.trigger} failed`,
        err as Error,
      );
    }
  }

  /** Catalogue defaults overlaid with the organisation's saved rules, for its org type. */
  async rulesFor(providerId: Types.ObjectId): Promise<{
    rules: ResolvedRule[];
    settings: PartnerNotificationSettingsDocument | null;
    provider: ProviderDocument | null;
  }> {
    const [provider, settings] = await Promise.all([
      this.providerModel.findById(providerId).exec(),
      this.settingsModel.findOne({ providerId }).exec(),
    ]);
    const orgType = provider ? orgTypeOf(provider.type) : undefined;
    const saved = new Map((settings?.rules ?? []).map((r) => [r.trigger, r]));
    const rules = TRIGGER_CATALOG.filter(
      (d) => !orgType || d.orgTypes.includes(orgType),
    ).map((d: TriggerDefinition): ResolvedRule => {
      const s = saved.get(d.trigger);
      return s
        ? {
            trigger: d.trigger,
            inApp: s.inApp,
            email: s.email,
            sms: s.sms,
            desktop: s.desktop,
            webhook: s.webhook,
            roles: s.roles,
          }
        : { trigger: d.trigger, ...d.defaultChannels, roles: d.defaultRoles };
    });
    return { rules, settings, provider };
  }

  /** Sends a signed `ping` event to the configured endpoint and records the attempt. */
  async sendTest(
    providerId: Types.ObjectId,
  ): Promise<PartnerWebhookDeliveryDocument> {
    const { settings, provider } = await this.rulesFor(providerId);
    const url = settings?.webhook?.url;
    const secret = settings?.webhook?.secret;
    if (!url || !secret) {
      return this.deliveryModel.create({
        providerId,
        eventId: `evt_${randomUUID()}`,
        trigger: 'ping',
        url: url ?? '(not configured)',
        ok: false,
        error: 'Configure a webhook URL first',
        test: true,
      });
    }
    return this.deliver(
      providerId,
      url,
      secret,
      provider?.name ?? '',
      'ping',
      {
        message: 'Test event from the Ayuva Partner Portal',
      },
      true,
    );
  }

  private async dispatch(providerId: Types.ObjectId, event: PartnerEvent) {
    const { rules, settings, provider } = await this.rulesFor(providerId);
    const rule = rules.find((r) => r.trigger === event.trigger);
    if (!rule || !provider) return;

    const members = await this.memberModel
      .find({ providerId, status: MemberStatus.ACTIVE })
      .exec();
    const explicit = new Set(event.memberIds ?? []);
    const recipients = members.filter(
      (m) =>
        (rule.roles.includes(m.role) || explicit.has(m.id)) &&
        m.userId.toString() !== event.excludeUserId,
    );
    const safe =
      event.safeMessage ??
      `${event.title} — open the Ayuva Partner Portal for details.`;
    let patientName = 'A patient';
    if (event.patientId && Types.ObjectId.isValid(event.patientId)) {
      const patient = await this.userModel
        .findById(event.patientId)
        .select('fullName')
        .lean()
        .exec();
      if (patient?.fullName) patientName = patient.fullName;
    }
    const fill = (s: string) => s.split('{patient}').join(patientName);

    const tasks: Promise<unknown>[] = [];
    for (const m of recipients) {
      // Desktop alerts are raised by the portal from the in-app feed, so they need the feed entry.
      if (rule.inApp || rule.desktop) {
        tasks.push(
          this.notifications.create(m.userId.toString(), {
            trigger: feedTrigger(event.trigger),
            category: 'general',
            title: fill(event.title),
            message: fill(event.message),
            lockScreenText: event.title,
            actionLabel: 'Open',
            actionRoute: event.route,
            actionParams: event.params,
          }),
        );
      }
      if (rule.email && m.email) {
        tasks.push(
          this.mail.sendMail(
            m.email,
            `[Ayuva] ${event.title}`,
            this.emailHtml(provider.name, event.title, safe),
          ),
        );
      }
      if (rule.sms && m.phone) {
        tasks.push(this.sms.send(m.phone, `Ayuva: ${safe}`));
      }
    }
    if (
      rule.webhook &&
      settings?.webhook?.enabled &&
      settings.webhook.url &&
      settings.webhook.secret
    ) {
      tasks.push(
        this.deliver(
          providerId,
          settings.webhook.url,
          settings.webhook.secret,
          provider.name,
          event.trigger,
          event.data ?? {},
          false,
        ),
      );
    }
    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === 'rejected')
        this.logger.warn(
          `Partner notification channel failed: ${String(r.reason)}`,
        );
    }
  }

  private async deliver(
    providerId: Types.ObjectId,
    url: string,
    secret: string,
    orgName: string,
    type: string,
    data: Record<string, unknown>,
    test: boolean,
  ): Promise<PartnerWebhookDeliveryDocument> {
    const eventId = `evt_${randomUUID()}`;
    const body = JSON.stringify({
      id: eventId,
      type,
      createdAt: new Date().toISOString(),
      organisation: { id: providerId.toString(), name: orgName },
      data,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex');
    const started = Date.now();
    let statusCode: number | undefined;
    let error: string | undefined;
    try {
      await assertSafeWebhookUrl(
        url,
        this.config.get<string>('nodeEnv') !== 'production',
      );
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Ayuva-Webhooks/1.0',
          'X-Ayuva-Event': type,
          'X-Ayuva-Delivery': eventId,
          'X-Ayuva-Timestamp': timestamp,
          'X-Ayuva-Signature': `sha256=${signature}`,
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      statusCode = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return this.deliveryModel.create({
      providerId,
      eventId,
      trigger: type,
      url,
      statusCode,
      ok: !error,
      error,
      durationMs: Date.now() - started,
      test,
    });
  }

  private emailHtml(orgName: string, title: string, text: string): string {
    const portal = `${this.config.get<string>('frontend.url') ?? ''}/partner/dashboard`;
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `
      <div style="font-family:Arial,sans-serif;max-width:520px">
        <p style="color:#0E7C7B;font-weight:bold;margin:0 0 4px">Ayuva Partner Portal · ${esc(orgName)}</p>
        <h2 style="margin:0 0 12px;color:#16302E">${esc(title)}</h2>
        <p style="color:#334;line-height:1.5">${esc(text)}</p>
        <p><a href="${esc(portal)}" style="background:#0E7C7B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the portal</a></p>
        <p style="color:#889;font-size:12px">You receive this because of your organisation's Notification Center settings.</p>
      </div>`;
  }
}
