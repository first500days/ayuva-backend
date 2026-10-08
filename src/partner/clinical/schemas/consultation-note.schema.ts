import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum NoteStatus {
  DRAFT = 'draft',
  SIGNED = 'signed',
}

@Schema({ _id: false })
export class NoteSections {
  @Prop({ default: '' }) chiefComplaint: string;
  @Prop({ default: '' }) history: string;
  @Prop({ default: '' }) examination: string;
  @Prop({ default: '' }) assessment: string;
  @Prop({ default: '' }) plan: string;
  @Prop({ default: '' }) advice: string;
  @Prop({ default: '' }) followUp: string;
}
export const NoteSectionsSchema = SchemaFactory.createForClass(NoteSections);

@Schema({ _id: false })
export class NoteVitals {
  @Prop() bp?: string;
  @Prop() pulse?: string;
  @Prop() temperature?: string;
  @Prop() spo2?: string;
  @Prop() respiratoryRate?: string;
  @Prop() weight?: string;
  @Prop() height?: string;
}
export const NoteVitalsSchema = SchemaFactory.createForClass(NoteVitals);

export type ConsultationNoteDocument = HydratedDocument<ConsultationNote>;

/**
 * Clinical / consultation note (AYUVA Scribe). The doctor's raw typed or
 * dictated input is kept alongside the structured sections; a signed note is
 * immutable. Only the doctor's own words ever reach the patient — the
 * structuring step only reorders them.
 */
@Schema({ timestamps: true, collection: 'partner_consultation_notes' })
export class ConsultationNote {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember', required: true })
  authorMemberId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  authorUserId: Types.ObjectId;

  @Prop({ required: true })
  authorName: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  patientName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Appointment' })
  appointmentId?: Types.ObjectId;

  @Prop({ default: '' })
  rawInput: string;

  @Prop({
    type: String,
    enum: ['typed', 'dictated', 'mixed'],
    default: 'typed',
  })
  inputMode: string;

  @Prop({ type: NoteSectionsSchema, default: () => ({}) })
  sections: NoteSections;

  @Prop({ type: NoteVitalsSchema, default: () => ({}) })
  vitals: NoteVitals;

  // 'mock' | 'real' when the AYUVA Scribe structured it, 'manual' when typed straight into sections.
  @Prop({ type: String, enum: ['mock', 'real', 'manual'], default: 'manual' })
  structuringSource: string;

  @Prop({
    type: String,
    enum: NoteStatus,
    default: NoteStatus.DRAFT,
    index: true,
  })
  status: NoteStatus;

  @Prop()
  signedAt?: Date;

  @Prop()
  sharedWithPatientAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MedicalRecord' })
  vaultRecordId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Prescription' })
  prescriptionId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ConsultationNoteSchema =
  SchemaFactory.createForClass(ConsultationNote);
ConsultationNoteSchema.index({ providerId: 1, patientId: 1, createdAt: -1 });
