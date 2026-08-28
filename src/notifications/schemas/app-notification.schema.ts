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

export type AppNotificationDocument = HydratedDocument<AppNotification>;

@Schema({ timestamps: { createdAt: 'occurredAt', updatedAt: false } })
export class AppNotification {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  trigger: string;

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
