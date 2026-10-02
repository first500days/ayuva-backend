import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Appointment } from '../../appointments/schemas/appointment.schema';

/**
 * The Medical Vault folders (U08 / H5 Health Passport). The value doubles as
 * the folder — there is no separate `folder` field — and it is what a
 * "record types" share scope selects on (U10).
 */
export enum MedicalRecordType {
  PRESCRIPTION = 'prescription',
  LAB_REPORT = 'lab_report',
  SCAN = 'scan',
  DISCHARGE = 'discharge',
  INSURANCE = 'insurance',
  VACCINATION = 'vaccination',
  CERTIFICATE = 'certificate',
}

/**
 * Pre-vault record types → folder. Used by the one-off migration
 * (src/migrations/001-record-folders.ts) and to keep accepting the old values
 * from app builds released before the vault redesign.
 */
export const LEGACY_RECORD_TYPE_MAP: Readonly<
  Record<string, MedicalRecordType>
> = {
  blood: MedicalRecordType.LAB_REPORT,
  imaging: MedicalRecordType.SCAN,
  // An ECG is a test result read by a clinician, not imaging.
  ecg: MedicalRecordType.LAB_REPORT,
  // OPD consultation notes are the prescription slip in practice.
  consultation: MedicalRecordType.PRESCRIPTION,
};

/** Maps a legacy type to its folder; passes anything else through unchanged. */
export function normalizeRecordType<T>(value: T): T | MedicalRecordType {
  return typeof value === 'string' && value in LEGACY_RECORD_TYPE_MAP
    ? LEGACY_RECORD_TYPE_MAP[value]
    : value;
}

/** Whether the patient uploaded the file or the platform generated it from one. */
export enum MedicalRecordKind {
  ORIGINAL = 'original',
  // AI Simplifier output saved to the vault (U09), linked via derivedFromRecordId.
  SIMPLIFICATION = 'simplification',
  // Visit-prep summary PDF (U07). Not a clinical document, so it belongs to no
  // folder: it is stored with a nominal type but left out of folder listings
  // and "record types" shares (it carries the patient's symptom notes). It
  // still shows in the timeline, search, its appointment and full-history /
  // rolling / selected-document shares.
  VISIT_SUMMARY = 'visit_summary',
}

/** Kinds that a folder (type) filter or a "record types" share matches. */
export const FOLDER_KINDS: readonly MedicalRecordKind[] = [
  MedicalRecordKind.ORIGINAL,
  MedicalRecordKind.SIMPLIFICATION,
];

export enum RecordStatusEnhanced {
  UPLOADED = 'uploaded',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  INTERPRETED = 'interpreted',
  FAILED = 'failed',
  NEEDS_REVIEW = 'needs_review',
  ARCHIVED = 'archived',
}

export type MedicalRecordDocument = HydratedDocument<MedicalRecord>;

@Schema({ timestamps: { createdAt: 'uploadedAt', updatedAt: true } })
export class MedicalRecord {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  // Encrypted object storage key/URL (NFR-1) — never a raw public URL.
  @Prop({ required: true })
  fileRef: string;

  // Original upload filename — the closest thing to a "title" for FR-8.4's listing,
  // since TRD's MedicalRecord entity has no dedicated title field.
  @Prop({ required: true })
  originalFileName: string;

  // Served back on download. Absent on records uploaded before it was stored.
  @Prop()
  mimeType?: string;

  @Prop({ type: String, enum: MedicalRecordType, required: true, index: true })
  type: MedicalRecordType;

  @Prop({
    type: String,
    enum: MedicalRecordKind,
    default: MedicalRecordKind.ORIGINAL,
  })
  kind: MedicalRecordKind;

  // Source record for a SIMPLIFICATION / VISIT_SUMMARY.
  @Prop({ type: SchemaTypes.ObjectId, index: true })
  derivedFromRecordId?: Types.ObjectId;

  // Clinical date of the document (report date, discharge date), as opposed to
  // when it was uploaded. Drives the vault timeline and "last 6 months"
  // share scopes; falls back to uploadedAt when unknown.
  @Prop()
  recordDate?: Date;

  @Prop({ trim: true })
  providerName?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  // Links this record/its interpretation to an upcoming booked appointment (PRD FR-9.5, TRD §4.4).
  @Prop({ type: SchemaTypes.ObjectId, ref: Appointment.name })
  attachedAppointmentId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: RecordStatusEnhanced,
    default: RecordStatusEnhanced.UPLOADED,
    index: true,
  })
  status: RecordStatusEnhanced;

  @Prop()
  processingStartedAt?: Date;

  @Prop()
  processingCompletedAt?: Date;

  @Prop({ type: [String], default: [] })
  accessPermissions: string[];

  @Prop({
    type: [{ adminId: SchemaTypes.ObjectId, accessedAt: Date, action: String }],
    default: [],
  })
  accessHistory: {
    adminId: Types.ObjectId;
    accessedAt: Date;
    action: string;
  }[];

  @Prop()
  aiInterpretationId?: Types.ObjectId;

  @Prop()
  aiStatus?: string;

  uploadedAt?: Date;
}

export const MedicalRecordSchema = SchemaFactory.createForClass(MedicalRecord);
