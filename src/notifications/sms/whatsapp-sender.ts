import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskPhone } from './sms-sender';

export const WHATSAPP_SENDER = 'WHATSAPP_SENDER';

/**
 * WhatsApp notices through Twilio's Messages API (same account as SMS).
 * Business-initiated WhatsApp messages need a template approved by Meta:
 * with TWILIO_WHATSAPP_CONTENT_SID set, the template is sent with the link
 * as its single variable; otherwise the plain body is sent, which only
 * delivers inside an open 24-hour session (or the Twilio sandbox).
 * Without configuration, messages are logged only.
 */
export interface WhatsAppSender {
  /** Whether messages really leave the platform. */
  readonly live: boolean;
  /** `to` is E.164. Resolves false when the message could not be sent. */
  send(to: string, body: string, link?: string): Promise<boolean>;
}

export class LogWhatsAppSender implements WhatsAppSender {
  readonly live = false;
  private readonly logger = new Logger(LogWhatsAppSender.name);

  send(to: string, body: string): Promise<boolean> {
    this.logger.log(
      `[log-only WhatsApp] -> to=${maskPhone(to)} (${body.length} chars)`,
    );
    return Promise.resolve(true);
  }
}

export class TwilioWhatsAppSender implements WhatsAppSender {
  readonly live = true;
  private readonly logger = new Logger(TwilioWhatsAppSender.name);

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
    private readonly contentSid?: string,
  ) {}

  async send(to: string, body: string, link?: string): Promise<boolean> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`;
    const prefix = (n: string) =>
      n.startsWith('whatsapp:') ? n : `whatsapp:${n}`;
    const form = new URLSearchParams({
      To: prefix(to),
      From: prefix(this.from),
    });
    if (this.contentSid) {
      form.set('ContentSid', this.contentSid);
      form.set('ContentVariables', JSON.stringify({ 1: link ?? '' }));
    } else {
      form.set('Body', body);
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });
      if (!res.ok) {
        this.logger.error(
          `WhatsApp send to ${maskPhone(to)} failed: HTTP ${res.status}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(
        `WhatsApp send to ${maskPhone(to)} failed`,
        err as Error,
      );
      return false;
    }
  }
}

export const whatsAppSenderProvider: Provider = {
  provide: WHATSAPP_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): WhatsAppSender => {
    const sid = config.get<string>('sms.twilioAccountSid');
    const token = config.get<string>('sms.twilioAuthToken');
    const from = config.get<string>('sms.whatsappFrom');
    if (sid && token && from)
      return new TwilioWhatsAppSender(
        sid,
        token,
        from,
        config.get<string>('sms.whatsappContentSid') || undefined,
      );
    return new LogWhatsAppSender();
  },
};
