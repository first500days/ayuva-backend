import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum LisStatus {
  REQUESTED = 'requested',
  COLLECTED = 'collected',
  RECEIVED = 'received',
  PROCESSING = 'processing',
  RESULTED = 'resulted',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export const LIS_DEPARTMENTS = [
  'haematology',
  'biochemistry',
  'microbiology',
  'histopathology',
  'cytology',
  'serology',
  'clinical_pathology',
  'blood_bank',
  'other',
] as const;

export const LIS_SPECIMENS = [
  'blood',
  'serum',
  'plasma',
  'urine',
  'stool',
  'sputum',
  'swab',
  'csf',
  'pus',
  'body_fluid',
  'tissue',
  'other',
] as const;

export const LIS_PRIORITIES = ['routine', 'urgent', 'stat'] as const;

export const LIS_REJECT_REASONS = [
  'haemolysed',
  'clotted',
  'insufficient',
  'unlabelled',
  'wrong_container',
  'leaked',
  'delayed',
  'other',
] as const;

export const LIS_ENTRY_KINDS = [
  'preliminary',
  'final',
  'addendum',
  'note',
] as const;
export type LisEntryKind = (typeof LIS_ENTRY_KINDS)[number];

@Schema({ _id: false })
export class LisPerson {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  memberId?: Types.ObjectId;
  @Prop({ required: true }) name: string;
}
export const LisPersonSchema = SchemaFactory.createForClass(LisPerson);

/** One step of the sample's journey. */
@Schema({ _id: false })
export class LisEvent {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) status: string;
  @Prop() byName?: string;
  @Prop() note?: string;
}
export const LisEventSchema = SchemaFactory.createForClass(LisEvent);

/** A text result entry. Entries are never edited; corrections are addenda. */
@Schema({ _id: true })
export class LisEntry {
  _id: Types.ObjectId;
  @Prop({ required: true }) at: Date;
  @Prop({ type: String, enum: LIS_ENTRY_KINDS, required: true })
  kind: LisEntryKind;
  @Prop({ required: true }) text: string;
  @Prop({ default: false }) critical: boolean;
  @Prop() byName?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  byMemberId?: Types.ObjectId;
}
export const LisEntrySchema = SchemaFactory.createForClass(LisEntry);

export type LisSampleDocument = HydratedDocument<LisSample>;

/**
 * Hospital Laboratory Information System: one specimen from request to
 * verified report — blood, pathology and microbiology alike — with a
 * text-based result log. Patients may be inpatients, emergency visits or
 * name-only (no Ayuva account needed).
 */
@Schema({ timestamps: true, collection: 'partner_lis_samples' })
export class LisSample {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true }) accessionNo: string;
  // Tube / container label, scanned at collection or reception.
  @Prop({ trim: true }) barcode?: string;

  @Prop({ required: true, trim: true }) patientName: string;
  @Prop() age?: number;
  @Prop() gender?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) patientId?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerAdmission' })
  admissionId?: Types.ObjectId;
  @Prop() admissionNo?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ErVisit' })
  erVisitId?: Types.ObjectId;
  @Prop() erNo?: string;
  // Where to collect / send the report: "Ortho Ward · Bed 4", "Emergency", "OPD".
  @Prop({ trim: true }) location?: string;

  @Prop({ type: String, enum: LIS_DEPARTMENTS, required: true })
  department: string;
  @Prop({ type: String, enum: LIS_SPECIMENS, required: true }) specimen: string;
  @Prop({ trim: true }) container?: string;
  @Prop({ type: [String], default: [] }) tests: string[];
  @Prop({ type: String, enum: LIS_PRIORITIES, default: 'routine' })
  priority: string;
  @Prop({ trim: true }) clinicalNotes?: string;

  @Prop({ type: LisPersonSchema, required: true }) requestedBy: LisPerson;

  @Prop({
    type: String,
    enum: LisStatus,
    default: LisStatus.REQUESTED,
    index: true,
  })
  status: LisStatus;
  @Prop({ type: [LisEventSchema], default: [] }) timeline: LisEvent[];

  @Prop() collectedAt?: Date;
  @Prop() collectedByName?: string;
  @Prop() receivedAt?: Date;
  @Prop() receivedByName?: string;
  @Prop() resultedAt?: Date;
  @Prop() verifiedAt?: Date;
  @Prop({ type: LisPersonSchema }) verifiedBy?: LisPerson;

  @Prop({ type: String, enum: LIS_REJECT_REASONS }) rejectReason?: string;
  @Prop() rejectNote?: string;
  // A rejected sample's replacement request, and the other way round.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'LisSample' })
  recollectionId?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'LisSample' })
  recollectionOf?: Types.ObjectId;
  @Prop() recollectionNo?: string;
  @Prop() recollectionOfNo?: string;

  @Prop({ type: [LisEntrySchema], default: [] }) entries: LisEntry[];
  @Prop({ default: false }) critical: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LisSampleSchema = SchemaFactory.createForClass(LisSample);
LisSampleSchema.index({ providerId: 1, accessionNo: 1 }, { unique: true });
LisSampleSchema.index(
  { providerId: 1, barcode: 1 },
  { unique: true, partialFilterExpression: { barcode: { $type: 'string' } } },
);
LisSampleSchema.index({ providerId: 1, status: 1, createdAt: -1 });
