import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { MailService, maskEmail } from '../../mail/mail.service';
import { maskPhone } from '../sms/sms-sender';
import { WHATSAPP_SENDER } from '../sms/whatsapp-sender';
import type { WhatsAppSender } from '../sms/whatsapp-sender';
import { UserPushService } from '../user-push.service';
import { IssuedLink, PatientContact, ReportLinksService } from './report-links.service';
import { ReportLinkChannel } from './schemas/report-link.schema';

// Every word here passes through Google, Apple, Meta or a mail provider, so
// none of it says who the patient is, what was tested or who ordered it.
export const REPORT_READY_TITLE = 'Your Ayuvax health records are ready';
const PUSH_BODY = 'Open the Ayuva app to see them.';
const LINK_BODY = 'Your Ayuvax health records are ready. Open them securely:';

type Channel = 'push' | ReportLinkChannel;
type Status = 'sent' | 'skipped' | 'failed';

export interface ChannelResult {
  channel: Channel;
  status: Status;
  detail?: string;
  /** Local development only, when the channel is log-only. */
  devUrl?: string;
}

export interface ReportDispatchOutcome {
  channels: ChannelResult[];
}

export interface ReportApproved {
  patientId: Types.ObjectId | string;
  recordId: Types.ObjectId | string;
  providerId: Types.ObjectId | string;
  actorUserId: string;
  ip?: string;
}

const skipped = (channel: Channel, detail: string): ChannelResult => ({
  channel,
  status: 'skipped',
  detail,
});

/**
 * Sends an approved report to the patient over the app, WhatsApp and email at
 * once. Best-effort: a failed channel never fails the sign-off that raised it.
 */
@Injectable()
export class ReportDispatchService {
  private readonly logger = new Logger(ReportDispatchService.name);

  constructor(
    private readonly links: ReportLinksService,
    private readonly push: UserPushService,
    private readonly mail: MailService,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: WhatsAppSender,
  ) {}

  private get isProduction(): boolean {
    return this.config.get<string>('nodeEnv') === 'production';
  }

  async reportApproved(input: ReportApproved): Promise<ReportDispatchOutcome> {
    try {
      return await this.dispatch(input);
    } catch (err) {
      this.logger.error(
        `Report dispatch failed for record ${input.recordId.toString()}`,
        err as Error,
      );
      return { channels: [] };
    }
  }

  private async dispatch(input: ReportApproved): Promise<ReportDispatchOutcome> {
    const contact = await this.links.contact(input.patientId);
    if (!contact) return { channels: [] };
    const results = await Promise.allSettled([
      this.viaPush(input, contact),
      this.viaLink('whatsapp', input, contact),
      this.viaLink('email', input, contact),
    ]);
    const names: Channel[] = ['push', 'whatsapp', 'email'];
    const channels = results.map((r, i): ChannelResult => {
      if (r.status === 'fulfilled') return r.value;
      this.logger.warn(`Report ${names[i]} failed: ${String(r.reason)}`);
      return { channel: names[i], status: 'failed' };
    });
    await this.audit.record({
      actorId: input.actorUserId,
      action: AuditAction.REPORT_DISPATCHED,
      targetType: 'MedicalRecord',
      targetId: input.recordId.toString(),
      metadata: {
        patientId: input.patientId.toString(),
        providerId: input.providerId.toString(),
        label: `Report sent: ${
          channels
            .filter((c) => c.status === 'sent')
            .map((c) => c.channel)
            .join(', ') || 'nothing delivered'
        }`,
        channels: Object.fromEntries(channels.map((c) => [c.channel, c.status])),
      },
      ipAddress: input.ip,
    });
    return { channels };
  }

  private async viaPush(
    input: ReportApproved,
    contact: PatientContact,
  ): Promise<ChannelResult> {
    if (!contact.prefs.results || !contact.prefs.push)
      return skipped('push', 'Turned off by the patient');
    const { devices, delivered } = await this.push.send(
      contact.accountId,
      {
        title: REPORT_READY_TITLE,
        body: PUSH_BODY,
        data: {
          type: 'report_ready',
          recordId: input.recordId.toString(),
          ...(contact.profileId && { profileId: contact.profileId }),
        },
      },
      { wake: true },
    );
    if (!devices) return skipped('push', 'The patient has no phone signed in');
    return delivered
      ? { channel: 'push', status: 'sent' }
      : { channel: 'push', status: 'failed' };
  }

  private async viaLink(
    channel: ReportLinkChannel,
    input: ReportApproved,
    contact: PatientContact,
  ): Promise<ChannelResult> {
    const label = channel === 'whatsapp' ? 'WhatsApp' : 'Email';
    if (!contact.prefs.results || !contact.prefs[channel])
      return skipped(channel, 'Turned off by the patient');
    const to = channel === 'whatsapp' ? contact.phone : contact.email;
    if (!to)
      return skipped(
        channel,
        channel === 'whatsapp' ? 'No mobile number on file' : 'No email on file',
      );
    const live = channel === 'whatsapp' ? this.whatsapp.live : this.mail.live;
    if (!live && this.isProduction) return skipped(channel, `${label} isn’t set up`);

    const issued = await this.links.issue({
      recordId: input.recordId,
      patientId: input.patientId,
      providerId: input.providerId,
      channel,
    });
    const ok = await this.sendLink(channel, to, issued);
    return {
      channel,
      status: ok ? 'sent' : 'failed',
      ...(!live && { devUrl: issued.url }),
    };
  }

  private sendLink(
    channel: ReportLinkChannel,
    to: string,
    issued: IssuedLink,
  ): Promise<boolean> {
    return channel === 'whatsapp'
      ? this.whatsapp.sendSecureLink(to, issued.url, issued.token, LINK_BODY)
      : this.mail.sendMail(to, REPORT_READY_TITLE, this.emailHtml(issued.url));
  }

  /** Sends a replacement link, only ever to the details already on record. */
  async renew(token: string) {
    const { link, issued } = await this.links.renew(token);
    const contact = await this.links.contact(link.patientId);
    const to = link.channel === 'whatsapp' ? contact?.phone : contact?.email;
    if (!to || !(await this.sendLink(link.channel, to, issued)))
      this.logger.warn(`Replacement link for ${link.jti} could not be sent`);
    return {
      sentVia: link.channel,
      masked: !to
        ? null
        : link.channel === 'whatsapp'
          ? maskPhone(to)
          : maskEmail(to),
      ...(!(link.channel === 'whatsapp' ? this.whatsapp.live : this.mail.live) &&
        !this.isProduction && { devUrl: issued.url }),
    };
  }

  private emailHtml(url: string): string {
    const safe = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return `
      <div style="font-family:Arial,sans-serif;max-width:520px">
        <p style="color:#0E7C7B;font-weight:bold;margin:0 0 4px">Ayuvax</p>
        <h2 style="margin:0 0 12px;color:#16302E">${REPORT_READY_TITLE}</h2>
        <p style="color:#334;line-height:1.5">Open them with the secure button below. You'll get a one-time code on your phone to confirm it's you.</p>
        <p><a href="${safe}" style="background:#0E7C7B;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open securely</a></p>
        <p style="color:#889;font-size:12px">For your privacy this link stops working after 30 minutes and can be used once. If it has expired, open it anyway to ask for a new one.</p>
      </div>`;
  }
}
