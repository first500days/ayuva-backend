import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum ErStatus {
  WAITING = 'waiting',
  TRIAGED = 'triaged',
  IN_TREATMENT = 'in_treatment',
  CLOSED = 'closed',
}

export const ARRIVAL_MODES = [
  'walk_in',
  'ambulance',
  'referred',
  'police',
  'other',
] as const;
export const ER_DISPOSITIONS = [
  'admitted',
  'discharged',
  'referred',
  'lama',
  'absconded',
  'deceased',
  'brought_dead',
] as const;
export type ErDisposition = (typeof ER_DISPOSITIONS)[number];

@Schema({ _id: false })
export class ErVitals {
  @Prop() hr?: number;
  @Prop() sbp?: number;
  @Prop() dbp?: number;
  @Prop() rr?: number;
  @Prop() spo2?: number;
  @Prop() temp?: number;
  @Prop() gcs?: number;
  @Prop() pain?: number;
  @Prop() glucose?: number;
}
export const ErVitalsSchema = SchemaFactory.createForClass(ErVitals);

/** One triage assessment; re-triage adds another. */
@Schema({ _id: false })
export class ErTriage {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true, min: 1, max: 5 }) level: number;
  @Prop({ type: ErVitalsSchema }) vitals?: ErVitals;
  // What the vital-sign rules suggested at the time, and why.
  @Prop() suggestedLevel?: number;
  @Prop({ type: [String], default: [] }) reasons: string[];
  // Required when the level chosen is less urgent than suggested.
  @Prop() overrideReason?: string;
  @Prop() notes?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  byMemberId?: Types.ObjectId;
  @Prop() byName?: string;
}
export const ErTriageSchema = SchemaFactory.createForClass(ErTriage);

/** Medico-legal case details (police intimation). */
@Schema({ _id: false })
export class ErMlc {
  @Prop({ default: false }) isMlc: boolean;
  @Prop({ trim: true }) mlcNo?: string;
  @Prop({ trim: true }) policeStation?: string;
  @Prop() informedAt?: Date;
}
export const ErMlcSchema = SchemaFactory.createForClass(ErMlc);

@Schema({ _id: false })
export class ErDispositionRecord {
  @Prop({ type: String, enum: ER_DISPOSITIONS, required: true })
  type: ErDisposition;
  @Prop({ required: true }) at: Date;
  @Prop() note?: string;
  @Prop() referredTo?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerAdmission' })
  admissionId?: Types.ObjectId;
  @Prop() admissionNo?: string;
  @Prop() byName?: string;
}
export const ErDispositionSchema =
  SchemaFactory.createForClass(ErDispositionRecord);

export type ErVisitDocument = HydratedDocument<ErVisit>;

/**
 * An Emergency / casualty attendance, separate from booked appointments:
 * quick registration (unidentified patients allowed), triage, doctor,
 * disposition. Times are kept for door-to-triage and door-to-doctor.
 */
@Schema({ timestamps: true, collection: 'partner_er_visits' })
export class ErVisit {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true }) erNo: string;

  @Prop({ required: true }) arrivedAt: Date;
  @Prop({ type: String, enum: ARRIVAL_MODES, default: 'walk_in' })
  arrivalMode: string;

  @Prop({ required: true, trim: true }) patientName: string;
  // Registered before anyone knew who they were ("Unknown male, ~40").
  @Prop({ default: false }) unidentified: boolean;
  @Prop() age?: number;
  @Prop({ default: false }) ageApprox: boolean;
  @Prop() gender?: string;
  @Prop({ trim: true }) phone?: string;
  @Prop({ trim: true }) broughtBy?: string;

  @Prop({ required: true, trim: true }) complaint: string;
  @Prop({ type: ErMlcSchema, default: () => ({ isMlc: false }) }) mlc: ErMlc;

  @Prop({ type: [ErTriageSchema], default: [] }) triage: ErTriage[];

  @Prop({
    type: String,
    enum: ErStatus,
    default: ErStatus.WAITING,
    index: true,
  })
  status: ErStatus;

  @Prop({ trim: true }) area?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  doctorMemberId?: Types.ObjectId;
  @Prop() doctorName?: string;
  @Prop() seenAt?: Date;

  @Prop({ type: ErDispositionSchema }) disposition?: ErDispositionRecord;

  // Most urgent level an arrival alert has gone out for (alerts once per visit and level).
  @Prop() alertedLevel?: number;

  @Prop() registeredByName?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ErVisitSchema = SchemaFactory.createForClass(ErVisit);
ErVisitSchema.index({ providerId: 1, erNo: 1 }, { unique: true });
ErVisitSchema.index({ providerId: 1, status: 1, arrivedAt: -1 });
