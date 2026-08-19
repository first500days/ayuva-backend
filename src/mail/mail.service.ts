import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('resend.apiKey');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY not configured - emails will not be sent');
      this.resend = null;
    }
  }

  async sendMail(
    to: string,
    subject: string,
    html: string,
  ): Promise<boolean> {
    const from = this.configService.get<string>('mail.from') ?? 'noreply@ayuva.com';

    if (!this.resend) {
      this.logger.warn(`Email not sent to ${to}: ${subject} (RESEND_API_KEY not configured)`);
      return false;
    }

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

  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    frontendUrl: string,
  ): Promise<boolean> {
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    const subject = 'Reset your Ayuva password';
    const html = `
      <p>You requested a password reset for your Ayuva account.</p>
      <p>Click the link below to set a new password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;
    return this.sendMail(to, subject, html);
  }

  async sendWelcomeEmail(
    to: string,
    entityName: string,
    entityType: 'Hospital' | 'Lab',
  ): Promise<boolean> {
    const subject = `Welcome to Ayuva, ${entityName}!`;
    const html = `
      <h2>Welcome to Ayuva, ${entityName}!</h2>
      <p>We're delighted to have your ${entityType.toLowerCase()} join the Ayuva platform.</p>
      <p>Our team is reviewing your profile and will reach out shortly with the next steps to go live.</p>
      <p>If you have any questions in the meantime, simply reply to this email.</p>
      <p>— The Ayuva Team</p>
    `;
    return this.sendMail(to, subject, html);
  }
}