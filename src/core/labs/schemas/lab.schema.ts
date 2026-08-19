import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum LabStatus {
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
export class LabLocation {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  address: string;
}
export const LabLocationSchema = SchemaFactory.createForClass(LabLocation);

@Schema({ _id: false })
export class LabSchedule {
  @Prop({ type: [String], enum: WorkingDay, default: [] })
  workingDays: WorkingDay[];

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  @Prop({ required: true })
  slotDurationMin: number;
}
export const LabScheduleSchema = SchemaFactory.createForClass(LabSchedule);

@Schema({ _id: false })
export class LabBlockedDate {
  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  reason: string;
}
export const LabBlockedDateSchema = SchemaFactory.createForClass(LabBlockedDate);

@Schema({ _id: false })
export class LabPriceItem {
  @Prop()
  testName?: string;

  @Prop()
  price?: number;

  @Prop()
  currency?: string;
}
export const LabPriceItemSchema = SchemaFactory.createForClass(LabPriceItem);

@Schema({ _id: false })
export class LabPricing {
  @Prop({ type: [LabPriceItemSchema], default: [] })
  items: LabPriceItem[];

  @Prop()
  currency?: string;
}
export const LabPricingSchema = SchemaFactory.createForClass(LabPricing);

@Schema({ _id: false })
export class LabReportWorkflow {
  @Prop()
  turnaroundHours?: number;

  @Prop({ type: [String], default: [] })
  deliveryMethods: string[];

  @Prop({ default: false })
  homeSampleCollection?: boolean;
}
export const LabReportWorkflowSchema =
  SchemaFactory.createForClass(LabReportWorkflow);

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

export type LabDocument = HydratedDocument<Lab>;

@Schema({ timestamps: true })
export class Lab {
  @Prop({ required: true, index: true })
  name: string;

  @Prop({ type: [LabLocationSchema], default: [] })
  locations: LabLocation[];

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop({ type: [String], default: [], index: true })
  specialty: string[];

  @Prop({ type: [String], default: [] })
  languages: string[];

  @Prop({ default: 0 })
  rating: number;

  @Prop({
    type: String,
    enum: LabStatus,
    default: LabStatus.PENDING,
    index: true,
  })
  status: LabStatus;

  @Prop({ type: LabScheduleSchema })
  schedule?: LabSchedule;

  @Prop({ type: [LabBlockedDateSchema], default: [] })
  blockedDates: LabBlockedDate[];

  @Prop({ type: LabPricingSchema, default: {} })
  pricing?: LabPricing;

  @Prop({ type: LabReportWorkflowSchema, default: {} })
  reportWorkflow?: LabReportWorkflow;

  @Prop()
  profileImageUrl?: string;

  @Prop({ type: [VerificationDocumentSchema], default: [] })
  verificationDocuments: VerificationDocument[];

  @Prop()
  licenseExpiryAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LabSchema = SchemaFactory.createForClass(Lab);
