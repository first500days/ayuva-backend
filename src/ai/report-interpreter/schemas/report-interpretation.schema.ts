import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MedicalRecord } from '../../../core/records/schemas/medical-record.schema';
import { Appointment } from '../../../core/appointments/schemas/appointment.schema';

export enum HighlightedValueStatus {
  NORMAL = 'normal',
  HIGH = 'high',
  LOW = 'low',
}

export enum ReportAiStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  INTERPRETED = 'interpreted',
}

/** Whether the patient may see the summary yet. */
export enum ReportReleaseStatus {
  RELEASED = 'released',
  // Flagged output waiting for a reviewer's "Approve & Send to Patient".
  HELD_FOR_REVIEW = 'held_for_review',
  // Escalated: withdrawn from the patient and routed to a human doctor.
  ESCALATED = 'escalated',
}

/** How the values in the summary were extracted from the document. */
export enum ExtractionMethod {
  AI_PARSED = 'ai_parsed',
  OCR_EXTRACTED = 'ocr_extracted',
}

/**
 * What the patient may see of an interpretation: a held or escalated summary
 * reads as still processing, with no text, until a reviewer releases it.
 */
export function patientView(
  interpretation?: Pick<ReportInterpretation, 'aiStatus' | 'summaryText' | 'releaseStatus'> | null,
): { aiStatus: ReportAiStatus; summaryText?: string } {
  if (!interpretation) return { aiStatus: ReportAiStatus.QUEUED };
  if ((interpretation.releaseStatus ?? ReportReleaseStatus.RELEASED) !== ReportReleaseStatus.RELEASED) {
    return { aiStatus: ReportAiStatus.PROCESSING };
  }
  return { aiStatus: interpretation.aiStatus, summaryText: interpretation.summaryText };
}

@Schema({ _id: false })
export class HighlightedValue {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  value: string;

  @Prop({ type: String, enum: HighlightedValueStatus, required: true })
  status: HighlightedValueStatus;
}
export const HighlightedValueSchema =
  SchemaFactory.createForClass(HighlightedValue);

// TRD §6 output spec: "glossary of terms/abbreviations" — separate from the
// highlighted numeric values above.
@Schema({ _id: false })
export class GlossaryTerm {
  @Prop({ required: true })
  term: string;

  @Prop({ required: true })
  definition: string;
}
export const GlossaryTermSchema = SchemaFactory.createForClass(GlossaryTerm);

export type ReportInterpretationDocument =
  HydratedDocument<ReportInterpretation>;

/**
 * status is rules-based against reference ranges, not LLM judgement (TRD §5.3);
 * every highlighted value must trace back to recordId (PRD §6).
 */
@Schema({ timestamps: true })
export class ReportInterpretation {
  @Prop({
    type: Types.ObjectId,
    ref: MedicalRecord.name,
    required: true,
    index: true,
  })
  recordId: Types.ObjectId;

  @Prop({ required: true })
  summaryText: string;

  @Prop({ type: [HighlightedValueSchema], default: [] })
  highlightedValues: HighlightedValue[];

  @Prop({ type: [GlossaryTermSchema], default: [] })
  glossaryTerms: GlossaryTerm[];

  @Prop({ type: [String], default: [] })
  suggestedQuestions: string[];

  @Prop({
    type: String,
    enum: ReportAiStatus,
    default: ReportAiStatus.QUEUED,
    index: true,
  })
  aiStatus: ReportAiStatus;

  @Prop({ type: Types.ObjectId, ref: Appointment.name })
  attachedAppointmentId?: Types.ObjectId;

  // Interpretations from before review existed were shown straight away.
  @Prop({
    type: String,
    enum: ReportReleaseStatus,
    default: ReportReleaseStatus.RELEASED,
    index: true,
  })
  releaseStatus: ReportReleaseStatus;

  @Prop({ type: String, enum: ExtractionMethod, default: ExtractionMethod.AI_PARSED })
  extractionMethod: ExtractionMethod;

  // The AI Control Center surface and exact prompt version that generated it.
  @Prop()
  surfaceKey?: string;

  @Prop()
  promptVersion?: string;

  // A clinician reviewed and confirmed the extracted values ("MD Verified").
  @Prop()
  verifiedAt?: Date;

  @Prop()
  verifiedBy?: string;

  @Prop()
  reviewNotes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReportInterpretationSchema =
  SchemaFactory.createForClass(ReportInterpretation);
