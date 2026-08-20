import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SystemSettingsDocument = HydratedDocument<SystemSettings>;

@Schema({ timestamps: true })
export class SystemSettings {
  @Prop({ default: false })
  maintenanceMode: boolean;

  @Prop({ default: '' })
  systemAnnouncement: string;

  @Prop({ default: true })
  userRegistrationOpen: boolean;

  @Prop({ default: 30 })
  sessionTimeoutMinutes: number;

  @Prop({ default: true })
  enforce2FAForAdmins: boolean;

  @Prop({
    type: Object,
    default: {
      ai_symptom_nav_v2: true,
      doctor_instant_booking: true,
      home_lab_sample_collection: true,
      multi_language_ai: false,
      direct_records_sharing: true,
      sponsored_placements_live: true,
      automated_settlement_batching: false,
    },
  })
  featureFlags: Record<string, boolean>;

  @Prop({
    type: [Object],
    default: [
      {
        id: 'tpl_appointment_confirm',
        name: 'Appointment Confirmation',
        channel: 'SMS & Email',
        subject: 'Your Ayuva Appointment is Confirmed (Ref: {{ref}})',
        body: 'Hello {{patientName}}, your appointment with {{doctorName}} at {{hospitalName}} on {{date}} at {{time}} is confirmed.',
      },
      {
        id: 'tpl_lab_report_ready',
        name: 'Lab Report Ready',
        channel: 'Push & Email',
        subject: 'Your Diagnostic Lab Report is Ready',
        body: 'Hello {{patientName}}, your report for {{testName}} from {{labName}} is now ready in your Ayuva Health Vault.',
      },
      {
        id: 'tpl_consent_revocation_alert',
        name: 'Consent Revocation Notice',
        channel: 'Email',
        subject: 'Health Record Access Revoked',
        body: 'Access permission granted to {{providerName}} has been successfully revoked per your instruction.',
      },
    ],
  })
  notificationTemplates: Array<{
    id: string;
    name: string;
    channel: string;
    subject: string;
    body: string;
  }>;
}

export const SystemSettingsSchema = SchemaFactory.createForClass(SystemSettings);
