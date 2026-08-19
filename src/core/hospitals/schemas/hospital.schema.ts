import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum HospitalType {
  CLINIC = 'CLINIC',
  HOSPITAL = 'HOSPITAL',
}

export enum HospitalStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum WorkingDay {
  MON = 'mon',
  TUE = 'tue',
  WED = 'wed',
  THU = 'thu',
  FRI = 'fri',
  SAT = 'sat',
  SUN = 'sun',
}

@Schema({ _id: false })
export class HospitalLocation {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  address: string;

  @Prop()
  lat?: number;

  @Prop()
  lng?: number;
}
export const HospitalLocationSchema =
  SchemaFactory.createForClass(HospitalLocation);

// Embedded schedule, ProviderSchedule-like (per-location working days/hours/slot duration).
@Schema({ _id: false })
export class HospitalSchedule {
  @Prop({ type: [String], enum: WorkingDay, default: [] })
  workingDays: WorkingDay[];

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ required: true })
  slotDurationMin: number;
}
export const HospitalScheduleSchema =
  SchemaFactory.createForClass(HospitalSchedule);

@Schema({ _id: false })
export class HospitalBlockedDate {
  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  reason: string;
}
export const HospitalBlockedDateSchema =
  SchemaFactory.createForClass(HospitalBlockedDate);

@Schema({ _id: false })
export class HospitalOpeningHours {
  @Prop({ type: String, enum: WorkingDay, required: true })
  day: WorkingDay;

  @Prop({ required: true })
  open: string;

  @Prop({ required: true })
  close: string;
}
export const HospitalOpeningHoursSchema =
  SchemaFactory.createForClass(HospitalOpeningHours);

@Schema({ _id: false })
export class VerificationDocument {
  @Prop()
  docType?: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  status?: string;
}
export const VerificationDocumentSchema =
  SchemaFactory.createForClass(VerificationDocument);

export type HospitalDocument = HydratedDocument<Hospital>;

@Schema({ timestamps: true })
export class Hospital {
  @Prop({ required: true, index: true })
  name: string;

  @Prop({ type: String, enum: HospitalType, required: true, index: true })
  type: HospitalType;

  @Prop({ type: [String], default: [], index: true })
  specialty: string[];

  @Prop({ type: [HospitalLocationSchema], default: [] })
  locations: HospitalLocation[];

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop({ type: [String], default: [] })
  languages: string[];

  @Prop({ default: 0 })
  rating: number;

  @Prop({ default: 0 })
  avgWaitMinutes: number;

  @Prop({
    type: String,
    enum: HospitalStatus,
    default: HospitalStatus.PENDING,
    index: true,
  })
  status: HospitalStatus;

  @Prop({ type: HospitalScheduleSchema })
  schedule?: HospitalSchedule;

  @Prop({ type: [HospitalBlockedDateSchema], default: [] })
  blockedDates: HospitalBlockedDate[];

  @Prop({ type: [String], default: [] })
  departments: string[];

  @Prop({ type: [String], default: [] })
  facilities: string[];

  @Prop({ type: [HospitalOpeningHoursSchema], default: [] })
  openingHours: HospitalOpeningHours[];

  @Prop()
  profileImageUrl?: string;

  @Prop({ type: [VerificationDocumentSchema], default: [] })
  verificationDocuments: VerificationDocument[];

  @Prop()
  licenseExpiryAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const HospitalSchema = SchemaFactory.createForClass(Hospital);
