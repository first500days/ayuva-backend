import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

type Attachment = { filename: string; content: Buffer };

/** "ab***@example.com": enough to trace a delivery, without an address in the logs. */
export function maskEmail(address: string): string {
  const [name, domain] = address.split('@');
  return domain ? `${name.slice(0, 2)}***@${domain}` : '***';
}

/**
 * Sends through SendGrid when SENDGRID_API_KEY is set, otherwise Resend, and
 * only logs when neither is configured.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly sendgridKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.sendgridKey = this.configService.get<string>('sendgrid.apiKey');
    const apiKey = this.configService.get<string>('resend.apiKey');
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.sendgridKey && !apiKey) {
      this.logger.warn(
        'No mail provider configured (SENDGRID_API_KEY / RESEND_API_KEY) - emails will not be sent',
      );
    }
  }

  /** Whether email really leaves the platform (false when it's only logged). */
  get live(): boolean {
    return !!this.sendgridKey || !!this.resend;
  }

  async sendMail(
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[],
  ): Promise<boolean> {
    if (!this.live) {
      this.logger.log(
        `[log-only mail] -> to=${maskEmail(to)} subject="${subject}"${attachments?.length ? ` attachments=${attachments.length}` : ''}`,
      );
      return true;
    }
    const from =
      this.configService.get<string>('mail.from') ?? 'noreply@ayuva.com';
    try {
      if (this.sendgridKey) {
        await this.viaSendGrid(from, to, subject, html, attachments);
      } else {
        const { error } = await this.resend!.emails.send({
          from,
          to,
          subject,
          html,
          ...(attachments?.length && { attachments }),
        });
        if (error) throw new Error(error.message);
      }
      this.logger.log(`Email sent to ${maskEmail(to)}: ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${maskEmail(to)}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private async viaSendGrid(
    from: string,
    to: string,
    subject: string,
    html: string,
    attachments?: Attachment[],
  ): Promise<void> {
    // MAIL_FROM can be "Ayuva <noreply@ayuva.com>".
    const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.sendgridKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: match ? { name: match[1], email: match[2] } : { email: from },
        subject,
        content: [{ type: 'text/html', value: html }],
        // Click tracking would rewrite our signed links through SendGrid.
        tracking_settings: {
          click_tracking: { enable: false, enable_text: false },
          open_tracking: { enable: false },
        },
        ...(attachments?.length && {
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content: a.content.toString('base64'),
            disposition: 'attachment',
          })),
        }),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SendGrid HTTP ${res.status}`);
  }

  async sendPasswordResetEmail(to: string, code: string): Promise<boolean> {
    const subject = 'Reset your Ayuva password';
    const html = `
      <p>You requested a password reset for your Ayuva account.</p>
      <p>Enter this code in the app to set a new password:</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${code}</p>
      <p>This code expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;
    return this.sendMail(to, subject, html);
  }
}
