import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../../core/users/schemas/user.schema';

export enum AiService {
  SYMPTOM_NAV = 'symptomNav',
  CARE_JOURNEY = 'careJourney',
  REPORT_INTERPRETER = 'reportInterpreter',
  ASSISTANT = 'assistant',
}

export enum AiReviewStatus {
  NONE = 'none',
  ASSIGNED = 'assigned',
  RESOLVED = 'resolved',
  INCORRECT = 'incorrect',
}

export type AIInteractionLogDocument = HydratedDocument<AIInteractionLog>;

/**
 * Written synchronously before every AI response returns (TRD §5.1 step 4),
 * and read by Admin AI Monitoring (PRD DC-5, FR-15.3) in near-real time.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AIInteractionLog {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: AiService, required: true, index: true })
  service: AiService;

  @Prop({ type: Object, required: true })
  input: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  outcome: Record<string, unknown>;

  @Prop({ required: true })
  latencyMs: number;

  // Auto-set when riskLevel >= Moderate-High (TRD §5.4); drives the escalation queue.
  @Prop({ default: false, index: true })
  flagged: boolean;

  @Prop({ type: String, enum: AiReviewStatus, default: AiReviewStatus.NONE })
  reviewStatus: string;

  // Set by Admin AI Monitoring reviewer actions (PRD FR-15.4, FR-15.5) — absent until assigned.
  @Prop({ type: Types.ObjectId, ref: User.name })
  assignedTo?: Types.ObjectId;

  @Prop()
  resolutionNotes?: string;

  // Populated by the timestamps option — declared for typed access (Admin AI Monitoring, FR-15.3).
  createdAt?: Date;
}

export const AIInteractionLogSchema =
  SchemaFactory.createForClass(AIInteractionLog);
