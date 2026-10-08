import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Provider } from '../../providers/schemas/provider.schema';
import { AppointmentSlot } from '../../providers/schemas/appointment-slot.schema';

export enum AppointmentStatus {
  REQUESTED = 'requested',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  RESCHEDULED = 'rescheduled',
  COMPLETED = 'completed',
  CANCELLED_BY_PATIENT = 'cancelled_by_patient',
  CANCELLED_BY_PROVIDER = 'cancelled_by_provider',
  NO_SHOW = 'no_show',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed',
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

  @Prop({ default: false })
  reminderEnabled: boolean;

  @Prop({ type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' })
  paymentStatus: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Transaction' })
  transactionId?: Types.ObjectId;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  disputeReason?: string;

  @Prop()
  internalNotes?: string;

  // Set when a partner schedules a follow-up from a completed visit (P05).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Appointment' })
  followUpOfId?: Types.ObjectId;

  @Prop()
  rejectionReason?: string;

  // Partner Portal: the practitioner (PartnerMember) seeing this patient, e.g.
  // a hospital front desk assigning an OPD booking to a doctor.
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'PartnerMember',
    index: true,
    sparse: true,
  })
  assignedMemberId?: Types.ObjectId;

  @Prop()
  assignedName?: string;

  // Department the visit is booked under — drives department analytics.
  @Prop()
  department?: string;

  createdAt?: Date;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);
