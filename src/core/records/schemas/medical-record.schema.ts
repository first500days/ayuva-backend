import { createHash } from 'node:crypto';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User, UserConsent } from '../../users/schemas/user.schema';
import { Appointment } from '../../appointments/schemas/appointment.schema';
import { systemFileName } from '../../../common/utils/system-file-name.util';

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

/**
 * Evidence of the patient's health-data processing consent, attached to the
 * record when it is ingested (or when the patient later gives consent). One
 * consent event can cover many records, so they share its tokenId.
 */
@Schema({ _id: false })
export class ConsentToken {
  @Prop({ required: true })
  tokenId: string;

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  healthDataProcessingAccepted: boolean;

  // When the patient accepted that consent.
  @Prop({ required: true })
  acceptedAt: Date;

  // When it was attached to this record.
  @Prop({ required: true })
  capturedAt: Date;

  @Prop({ type: String, enum: ['ingestion', 'reconsent'], required: true })
  capturedOn: 'ingestion' | 'reconsent';
}
export const ConsentTokenSchema = SchemaFactory.createForClass(ConsentToken);

export interface RecordConsentStatus {
  status: 'verified' | 'missing';
  // ingestion / reconsent: a token on the record; account: no token yet, the
  // patient's account-level consent stands in (records from before tokens).
  source: 'ingestion' | 'reconsent' | 'account' | 'none';
  detail: string;
  token?: ConsentToken;
}

/**
 * Whether a record may be processed. Needs a health-data consent token (or,
 * for records from before tokens existed, account-level consent) AND consent
 * that the patient has not since withdrawn. A missing status locks the
 * record: no AI processing and no admin file access.
 */
export function consentStatusOf(
  record: Pick<MedicalRecord, 'consentToken'>,
  accountConsent?: Pick<UserConsent, 'healthDataProcessingAccepted' | 'acceptedAt'> | null,
): RecordConsentStatus {
  const accountAccepted = accountConsent?.healthDataProcessingAccepted === true;
  const token = record.consentToken;
  if (token?.healthDataProcessingAccepted) {
    return accountAccepted
      ? {
          status: 'verified',
          source: token.capturedOn,
          detail: `Consent ${token.version} attached ${token.capturedOn === 'ingestion' ? 'at upload' : 'when the patient later consented'}`,
          token,
        }
      : {
          status: 'missing',
          source: token.capturedOn,
          detail: 'The patient has since withdrawn health-data processing consent',
          token,
        };
  }
  if (token) {
    return {
      status: 'missing',
      source: token.capturedOn,
      detail: 'The patient had declined health-data processing when this was uploaded',
      token,
    };
  }
  return accountAccepted
    ? { status: 'verified', source: 'account', detail: 'Uploaded before consent tokens; covered by the account consent on file' }
    : { status: 'missing', source: 'none', detail: 'No consent token was attached at upload' };
}

/**
 * The token to attach for a patient's current consent. Its id is derived
 * from the consent event (patient, version, acceptance time), so every record
 * covered by the same consent carries the same token id.
 */
export function consentTokenFor(
  patientId: string,
  consent: Pick<UserConsent, 'healthDataProcessingAccepted' | 'version' | 'acceptedAt'> | null | undefined,
  capturedOn: ConsentToken['capturedOn'],
): ConsentToken | undefined {
  if (!consent) return undefined;
  const digest = createHash('sha256')
    .update(`${patientId}:${consent.version}:${new Date(consent.acceptedAt).toISOString()}`)
    .digest('hex');
  return {
    tokenId: `CT-${digest.slice(0, 10).toUpperCase()}`,
    version: consent.version,
    healthDataProcessingAccepted: consent.healthDataProcessingAccepted,
    acceptedAt: new Date(consent.acceptedAt),
    capturedAt: new Date(),
    capturedOn,
  };
}

export type MedicalRecordDocument = HydratedDocument<MedicalRecord>;

/** System name for a record: stored on new uploads, derived for older ones. */
export function recordSystemFileName(
  record: Pick<MedicalRecord, 'systemFileName' | 'mimeType' | 'originalFileName'> & { id?: string },
): string {
  return (
    record.systemFileName ??
    systemFileName(record.id ?? '0000', record.mimeType, record.originalFileName)
  );
}

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
  // since TRD's MedicalRecord entity has no dedicated title field. Shown only
  // in the patient's own vault; everywhere else uses systemFileName.
  @Prop({ required: true })
  originalFileName: string;

  // AYUVA-IMG-2FBC.jpg — device filenames carry capture dates and app names,
  // so the storage key, admin and partner screens use this instead.
  @Prop()
  systemFileName?: string;

  @Prop({ type: ConsentTokenSchema })
  consentToken?: ConsentToken;

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
