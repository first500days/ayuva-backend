import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type NotificationTrigger =
  | 'booking_confirmed'
  | 'booking_changed'
  | 'appointment_approaching'
  | 'provider_requests_documents'
  | 'consultation_summary_uploaded'
  | 'test_booking_confirmed'
  | 'report_available'
  | 'permission_expiry';

/**
 * U11 filter tabs: All · Appointments · Documents · Family. Consent events
 * (access granted/revoked) show under All so a grant is never silent.
 */
export const NOTIFICATION_CATEGORIES = [
  'appointments',
  'documents',
  'family',
  'consent',
  'general',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type AppNotificationDocument = HydratedDocument<AppNotification>;

@Schema({ timestamps: { createdAt: 'occurredAt', updatedAt: false } })
export class AppNotification {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  trigger: string;

  @Prop({ type: String, enum: NOTIFICATION_CATEGORIES, default: 'general', index: true })
  category: NotificationCategory;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true })
  lockScreenText: string;

  @Prop({ default: 'View' })
  actionLabel: string;

  @Prop({ required: true })
  actionRoute: string;

  @Prop({ type: Object, default: {} })
  actionParams?: Record<string, string>;

  @Prop({ default: false })
  read: boolean;

  occurredAt?: Date;
}

export const AppNotificationSchema = SchemaFactory.createForClass(AppNotification);
AppNotificationSchema.index({ userId: 1, occurredAt: -1 });
