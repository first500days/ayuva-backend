import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../../core/users/schemas/user.schema';
import { AiSource } from '../../common/ai-source.enum';

export enum AiService {
  SYMPTOM_NAV = 'symptomNav',
  CARE_JOURNEY = 'careJourney',
  REPORT_INTERPRETER = 'reportInterpreter',
  ASSISTANT = 'assistant',
  // Partner Portal AYUVA Scribe — structures a doctor's own notes (never clinical advice).
  SCRIBE = 'scribe',
  // Insurance coding assistant — ICD-11 codes the note's own words name, as a provisional draft.
  CODING = 'coding',
  // Explain My Scan — a rule-based companion to an imaging report, for the patient.
  SCAN_EXPLAINER = 'scanExplainer',
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

  // mock until the AI-owning team's real service is dropped in (TRD §6) — every
  // response and log entry must carry this so mock output is never mistaken for real.
  @Prop({ type: String, enum: AiSource, required: true, default: AiSource.MOCK })
  source: AiSource;

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

  // The AI Control Center surface + prompt version in force when this ran.
  @Prop()
  surfaceKey?: string;

  @Prop()
  promptVersion?: string;

  // Usage, worked out when the interaction is written (ai-usage.ts). Token
  // counts are estimates while the engine is rule-based.
  @Prop()
  promptTokens?: number;

  @Prop()
  outputTokens?: number;

  @Prop({ type: [String], default: undefined })
  guardrails?: string[];

  // The Gemini model the surface's balancing rule picks, and why.
  @Prop()
  routedModel?: string;

  @Prop()
  routeReason?: string;

  // Human review outcome from the AI Monitoring queue.
  @Prop({ type: String, enum: ['approved', 'escalated'] })
  reviewAction?: 'approved' | 'escalated';

  @Prop()
  reviewedAt?: Date;

  // Reviewer's login email (the queue's "Reviewer" column).
  @Prop()
  reviewedBy?: string;

  // Populated by the timestamps option — declared for typed access (Admin AI Monitoring, FR-15.3).
  createdAt?: Date;
}

export const AIInteractionLogSchema =
  SchemaFactory.createForClass(AIInteractionLog);
