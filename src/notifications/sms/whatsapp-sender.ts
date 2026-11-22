import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskPhone } from './sms-sender';

export const WHATSAPP_SENDER = 'WHATSAPP_SENDER';

/**
 * WhatsApp notices, through Meta's Cloud API or Twilio. Business-initiated
 * messages need a template Meta has approved. Without configuration, messages
 * are logged only. Everything sent here passes through Meta, so the text is
 * always generic: no names, tests, results or doctors.
 */
export interface WhatsAppSender {
  /** Whether messages really leave the platform. */
  readonly live: boolean;
  /** `to` is E.164. Resolves false when the message could not be sent. */
  send(to: string, body: string, link?: string): Promise<boolean>;
  /**
   * The approved "your records are ready" template with its action button.
   * `urlSuffix` fills the variable part of the button's URL; `url` is the
   * whole link, for transports without URL buttons.
   */
  sendSecureLink(
    to: string,
    url: string,
    urlSuffix: string,
    body: string,
  ): Promise<boolean>;
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

  sendSecureLink(to: string, _url: string, _suffix: string, body: string) {
    return this.send(to, body);
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

  sendSecureLink(to: string, url: string, _suffix: string, body: string) {
    return this.send(to, `${body} ${url}`, url);
  }
}

export interface MetaWhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion: string;
  language: string;
  /** Generic text, one URL button whose URL ends in `{{1}}`. */
  reportTemplate: string;
  /** One body variable: `{{1}}` is the notice text. */
  noticeTemplate: string;
}

/** Template parameters may not hold newlines, tabs or long runs of spaces. */
const templateText = (s: string) =>
  s.replace(/\s+/g, ' ').trim().slice(0, 1024);

export class MetaWhatsAppSender implements WhatsAppSender {
  readonly live = true;
  private readonly logger = new Logger(MetaWhatsAppSender.name);

  constructor(private readonly config: MetaWhatsAppConfig) {}

  send(to: string, body: string, link?: string): Promise<boolean> {
    return this.post(to, this.config.noticeTemplate, [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: templateText(link ? `${body} ${link}` : body) },
        ],
      },
    ]);
  }

  sendSecureLink(to: string, _url: string, urlSuffix: string) {
    return this.post(to, this.config.reportTemplate, [
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: urlSuffix }],
      },
    ]);
  }

  private async post(
    to: string,
    template: string,
    components: unknown[],
  ): Promise<boolean> {
    const { apiVersion, phoneNumberId, accessToken, language } = this.config;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to.replace(/^whatsapp:/, '').replace(/^\+/, ''),
            type: 'template',
            template: { name: template, language: { code: language }, components },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
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
    const meta = config.get<MetaWhatsAppConfig>('whatsappCloud');
    if (meta?.phoneNumberId && meta.accessToken)
      return new MetaWhatsAppSender(meta);
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
