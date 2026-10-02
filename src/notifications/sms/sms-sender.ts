import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const SMS_SENDER = 'SMS_SENDER';

/**
 * Pluggable SMS transport for OTP codes (U01) and appointment-reminder SMS
 * (U11). The SMS provider is still an open decision (PRODUCT_JOURNEY_PLAN
 * Q5), so only Twilio's REST API is wired — no SDK — and anything else
 * falls back to logging.
 */
export interface SmsSender {
  /** `to` is E.164. Resolves false when the message could not be sent. */
  send(to: string, body: string): Promise<boolean>;
}

export class LogSmsSender implements SmsSender {
  private readonly logger = new Logger(LogSmsSender.name);

  async send(to: string, body: string): Promise<boolean> {
    // Never log the body in full: it may be an OTP.
    this.logger.log(`[log-only SMS] -> to=${maskPhone(to)} (${body.length} chars)`);
    return true;
  }
}

export class TwilioSmsSender implements SmsSender {
  private readonly logger = new Logger(TwilioSmsSender.name);

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(to: string, body: string): Promise<boolean> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: this.from, Body: body }),
      });
      if (!res.ok) {
        this.logger.error(`Twilio send to ${maskPhone(to)} failed: HTTP ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Twilio send to ${maskPhone(to)} failed`, err as Error);
      return false;
    }
  }
}

export function maskPhone(phone: string): string {
  return phone.length > 4 ? `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}` : '****';
}

export const smsSenderProvider: Provider = {
  provide: SMS_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): SmsSender => {
    const sid = config.get<string>('sms.twilioAccountSid');
    const token = config.get<string>('sms.twilioAuthToken');
    const from = config.get<string>('sms.from');
    if (sid && token && from) {
      return new TwilioSmsSender(sid, token, from);
    }
    new Logger('SmsProvider').warn(
      'SMS provider not configured — using the log-only sender. Set TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/SMS_FROM to send real SMS.',
    );
    return new LogSmsSender();
  },
};
