import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum ProviderCategory {
  GP = 'GP',
  SPECIALIST = 'Specialist',
  HOSPITAL = 'Hospital',
  DIAGNOSTIC = 'Diagnostic',
  PHYSIO = 'Physio',
}

export enum ProviderStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Schema({ _id: false })
export class ProviderLocation {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  address: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;
}
export const ProviderLocationSchema =
  SchemaFactory.createForClass(ProviderLocation);

export enum WorkingDay {
  MON = 'mon',
  TUE = 'tue',
  WED = 'wed',
  THU = 'thu',
  FRI = 'fri',
  SAT = 'sat',
  SUN = 'sun',
}

// Per-provider working days/hours/slot duration (PRD FR-14.1, FR-14.2). Optional —
// a provider with no schedule configured yet simply has no slots regenerated.
@Schema({ _id: false })
export class ProviderSchedule {
  @Prop({ type: [String], enum: WorkingDay, default: [] })
  workingDays: WorkingDay[];

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ required: true })
  slotDurationMin: number;
}
export const ProviderScheduleSchema =
  SchemaFactory.createForClass(ProviderSchedule);

// Ad hoc holiday/blocked-date entries per provider, with a reason label (PRD FR-14.4).
@Schema({ _id: false })
export class ProviderBlockedDate {
  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  reason: string;
}
export const ProviderBlockedDateSchema =
  SchemaFactory.createForClass(ProviderBlockedDate);

export type ProviderDocument = HydratedDocument<Provider>;

@Schema({ timestamps: true })
export class Provider {
  @Prop({ required: true, index: true })
  name: string;

  @Prop({ type: String, enum: ProviderCategory, required: true, index: true })
  type: ProviderCategory;

  @Prop({ type: [String], default: [], index: true })
  specialty: string[];

  @Prop({ type: [ProviderLocationSchema], default: [] })
  locations: ProviderLocation[];

  @Prop({ type: [String], default: [] })
  languages: string[];

  @Prop({ default: 0 })
  rating: number;

  @Prop({ default: 0 })
  avgWaitMinutes: number;

  @Prop()
  consultationFee?: number;

  @Prop({
    type: String,
    enum: ProviderStatus,
    default: ProviderStatus.ACTIVE,
    index: true,
  })
  status: ProviderStatus;

  // Backs POST /providers/:id/save (PRD FR-6.5) — no separate join collection needed yet.
  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  savedByUserIds: Types.ObjectId[];

  @Prop({ type: ProviderScheduleSchema })
  schedule?: ProviderSchedule;

  @Prop({ type: [ProviderBlockedDateSchema], default: [] })
  blockedDates: ProviderBlockedDate[];

  @Prop()
  profileImageUrl?: string;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'MedicalRecord' })
  verificationDocuments?: Types.ObjectId[];

  @Prop()
  licenseExpiryAt?: Date;

  @Prop({ default: 0 })
  totalAppointments?: number;

  @Prop({ default: 0 })
  completedAppointments?: number;

  @Prop({ default: 0 })
  cancellationRate?: number;

  @Prop({ default: 0 })
  noShowRate?: number;

  @Prop({ default: 0 })
  averageRating?: number;

  @Prop({ default: 0 })
  feedbackCount?: number;
}

export const ProviderSchema = SchemaFactory.createForClass(Provider);

// Supports free-text provider search (PRD FR-6.1, TRD §7 "provider search fields").
ProviderSchema.index({ name: 'text', specialty: 'text' });
