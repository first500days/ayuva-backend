import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Provider } from '../../providers/schemas/provider.schema';
import { AppointmentSlot } from '../../providers/schemas/appointment-slot.schema';

export enum AppointmentStatus {
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export type AppointmentDocument = HydratedDocument<Appointment>;

@Schema({ timestamps: true })
export class Appointment {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: Provider.name,
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: AppointmentSlot.name,
    required: true,
  })
  slotId: Types.ObjectId;

  @Prop({
    type: String,
    enum: AppointmentStatus,
    default: AppointmentStatus.CONFIRMED,
  })
  status: AppointmentStatus;

  // "Set reminder" inline action (FR-7.6) — toggles a scheduled push reminder before the visit.
  @Prop({ default: false })
  reminderEnabled: boolean;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);
