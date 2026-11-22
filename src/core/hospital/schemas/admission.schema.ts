import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum AdmissionStatus {
  ADMITTED = 'admitted',
  DISCHARGED = 'discharged',
}

@Schema({ _id: false })
export class AdmissionTransfer {
  @Prop({ required: true })
  at: Date;

  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  @Prop({ type: String, default: null })
  reason: string | null;

  @Prop({ type: String, default: null })
  byName: string | null;
}
export const AdmissionTransferSchema = SchemaFactory.createForClass(AdmissionTransfer);

export type AdmissionDocument = HydratedDocument<Admission>;

@Schema({ timestamps: true })
export class Admission {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true, index: true })
  providerId: Types.ObjectId;

  @Prop({ required: true })
  admissionNo: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  patientId: Types.ObjectId | null;

  @Prop({ required: true })
  patientName: string;

  @Prop({ type: String, default: null })
  patientPhone: string | null;

  @Prop({ type: Number, default: null })
  age: number | null;

  @Prop({ type: String, default: null })
  gender: string | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Ward', required: true, index: true })
  wardId: Types.ObjectId;

  @Prop({ required: true })
  bedId: string;

  @Prop({ type: String, default: null })
  department: string | null;

  // Not yet resolvable to a name — the staff/roster module doesn't exist backend-side yet.
  @Prop({ type: String, default: null })
  attendingMemberId: string | null;

  @Prop({ default: '' })
  reason: string;

  @Prop({ required: true })
  admittedAt: Date;

  @Prop({ type: Date, default: null })
  expectedDischargeAt: Date | null;

  @Prop({ type: String, enum: AdmissionStatus, default: AdmissionStatus.ADMITTED, index: true })
  status: AdmissionStatus;

  @Prop({ type: Date, default: null })
  dischargedAt: Date | null;

  @Prop({ type: String, default: null })
  dischargeType: string | null;

  @Prop({ default: '' })
  dischargeNote: string;

  @Prop({ default: false })
  summarySent: boolean;

  @Prop({ type: [AdmissionTransferSchema], default: [] })
  transfers: AdmissionTransfer[];

  @Prop({ type: String, default: null })
  admittedByName: string | null;

  createdAt?: Date;
  updatedAt?: Date;
}
export const AdmissionSchema = SchemaFactory.createForClass(Admission);
