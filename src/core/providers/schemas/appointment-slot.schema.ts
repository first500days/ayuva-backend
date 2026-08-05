import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Provider } from './provider.schema';

export enum AppointmentSlotStatus {
  OPEN = 'open',
  BOOKED = 'booked',
  BLOCKED = 'blocked',
}

export type AppointmentSlotDocument = HydratedDocument<AppointmentSlot>;

@Schema({ timestamps: true })
export class AppointmentSlot {
  @Prop({ type: SchemaTypes.ObjectId, ref: Provider.name, required: true })
  providerId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  time: string;

  @Prop({ required: true })
  durationMin: number;

  @Prop({
    type: String,
    enum: AppointmentSlotStatus,
    default: AppointmentSlotStatus.OPEN,
  })
  status: AppointmentSlotStatus;

  @Prop()
  blockedReason?: string;
}

export const AppointmentSlotSchema =
  SchemaFactory.createForClass(AppointmentSlot);

// Booking hot-path lookup (TRD §7): find a provider's slots for a given date.
AppointmentSlotSchema.index({ date: 1, providerId: 1 });
