import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SymptomEntry } from './symptom-entry.schema';

export enum Urgency {
  ROUTINE = 'routine',
  PRIORITY = 'priority',
  EMERGENCY = 'emergency',
}

export enum RiskLevel {
  LOW = 'low',
  MODERATE_HIGH = 'moderate_high',
  HIGH = 'high',
}

export enum RecommendedCareLevel {
  SELF_CARE = 'self_care',
  GP = 'gp',
  SPECIALIST = 'specialist',
  URGENT_CARE = 'urgent_care',
  EMERGENCY_ROOM = 'emergency_room',
}

export type TriageResultDocument = HydratedDocument<TriageResult>;

/**
 * urgency/riskLevel/recommendedCareLevel must always come from the
 * versioned clinical rules engine, never raw LLM output (TRD §5, PRD §6).
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TriageResult {
  @Prop({
    type: Types.ObjectId,
    ref: SymptomEntry.name,
    required: true,
    index: true,
  })
  symptomEntryId: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  understoodSymptoms: string[];

  @Prop({ type: String, enum: Urgency, required: true })
  urgency: Urgency;

  @Prop({ type: String, enum: RiskLevel, required: true, index: true })
  riskLevel: RiskLevel;

  @Prop({ type: String, enum: RecommendedCareLevel, required: true })
  recommendedCareLevel: RecommendedCareLevel;

  @Prop({ required: true })
  rulesVersion: string;
}

export const TriageResultSchema = SchemaFactory.createForClass(TriageResult);
