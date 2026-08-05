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
}

export const ReportInterpretationSchema =
  SchemaFactory.createForClass(ReportInterpretation);
