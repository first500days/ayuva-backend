import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { CodedDiagnosis, CodedDiagnosisSchema } from './coded-diagnosis.schema';

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

/** One pen stroke: colour, width and a flat [x0, y0, x1, y1, …] polyline in the 400 × 500 sketch space. */
@Schema({ _id: false })
export class SketchStroke {
  @Prop({ required: true }) c: string;
  @Prop({ required: true }) w: number;
  @Prop({ type: [Number], default: [] }) p: number[];
}
export const SketchStrokeSchema = SchemaFactory.createForClass(SketchStroke);

/** A drawing on an anatomical outline (or blank), kept with the note and printed on the visit summary. */
@Schema()
export class NoteSketch {
  _id?: Types.ObjectId;
  @Prop({ required: true }) template: string;
  @Prop({ default: '' }) caption: string;
  @Prop({ type: [SketchStrokeSchema], default: [] }) strokes: SketchStroke[];
  @Prop() updatedAt?: Date;
}
export const NoteSketchSchema = SchemaFactory.createForClass(NoteSketch);

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
    enum: ['typed', 'dictated', 'mixed', 'ambient'],
    default: 'typed',
  })
  inputMode: string;

  /** Ambient listening transcribes the patient too: when, and who recorded their agreement. */
  @Prop() ambientConsentAt?: Date;
  @Prop() ambientConsentBy?: string;

  @Prop({ type: NoteSectionsSchema, default: () => ({}) })
  sections: NoteSections;

  @Prop({ type: NoteVitalsSchema, default: () => ({}) })
  vitals: NoteVitals;

  @Prop({ type: [CodedDiagnosisSchema], default: [] })
  diagnoses: CodedDiagnosis[];

  @Prop({ type: [NoteSketchSchema], default: [] })
  sketches: NoteSketch[];

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
