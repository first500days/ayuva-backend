import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('resend.apiKey');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not configured - emails will not be sent');
      this.resend = null;
    } else {
      this.resend = new Resend(apiKey);
    }
  }

  async sendMail(
    to: string,
    subject: string,
    html: string,
  ): Promise<boolean> {
    if (!this.resend) {
      this.logger.log(`[log-only mail] -> to=${to} subject="${subject}"`);
      return true;
    }

    const from = this.configService.get<string>('mail.from') ?? 'noreply@ayuva.com';

    try {
      await this.resend.emails.send({
        from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      return false;
    }
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