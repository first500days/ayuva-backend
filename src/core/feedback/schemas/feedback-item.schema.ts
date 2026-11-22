import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export enum FeedbackType {
  FEEDBACK = 'feedback',
  FEATURE_REQUEST = 'featureRequest',
  SUPPORT = 'support',
  BUG = 'bug',
}

export enum FeedbackStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  WAITING_FOR_USER = 'waiting_for_user',
  ESCALATED = 'escalated',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

export enum FeedbackPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum FeedbackCategory {
  BUG = 'bug',
  FEATURE_REQUEST = 'feature_request',
  APPOINTMENT = 'appointment',
  PROVIDER = 'provider',
  PAYMENT = 'payment',
  AI = 'ai',
  MEDICAL_REPORT = 'medical_report',
  ACCOUNT = 'account',
  OTHER = 'other',
}

/**
 * A high-liability complaint handed to the legal and medical risk teams: the
 * AI output it concerns, the exact prompt version behind that output, and
 * any hold placed on the prompt while the case is reviewed.
 */
@Schema({ _id: false })
export class ComplianceEscalation {
  @Prop({ required: true })
  escalatedAt: Date;

  @Prop()
  escalatedBy?: string;

  @Prop()
  reason?: string;

  @Prop({ type: SchemaTypes.ObjectId })
  aiLogId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId })
  recordId?: Types.ObjectId;

  @Prop()
  recordType?: string;

  @Prop()
  surfaceKey?: string;

  @Prop()
  promptVersion?: string;

  // True when the output predates per-output version logging and the version
  // was reconstructed from the prompt history.
  @Prop({ default: false })
  promptVersionInferred: boolean;

  // Record type the prompt was paused for, pending the review.
  @Prop()
  pausedRecordType?: string;

  // The Operations Desk incident tracking the case.
  @Prop({ type: SchemaTypes.ObjectId })
  issueId?: Types.ObjectId;
}
export const ComplianceEscalationSchema =
  SchemaFactory.createForClass(ComplianceEscalation);

export type FeedbackItemDocument = HydratedDocument<FeedbackItem>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class FeedbackItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  reporterId: Types.ObjectId;

  @Prop({ type: String, enum: FeedbackType, required: true, index: true })
  type: FeedbackType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({
    type: String,
    enum: FeedbackStatus,
    default: FeedbackStatus.OPEN,
    index: true,
  })
  status: FeedbackStatus;

  // Ticket ownership (PRD FR-17.4) — unassigned until an admin picks it up.
  @Prop({ type: SchemaTypes.ObjectId, ref: User.name })
  assignedTo?: Types.ObjectId;

  // Optional patient-supplied satisfaction rating for the interaction being reported on,
  // feeding the "average CSAT" summary tile (PRD FR-17.2).
  @Prop({ min: 1, max: 5 })
  csatScore?: number;

  @Prop({ type: String, enum: FeedbackPriority, default: FeedbackPriority.MEDIUM, index: true })
  priority: FeedbackPriority;

  @Prop({ type: String, enum: FeedbackCategory, default: FeedbackCategory.OTHER, index: true })
  category: FeedbackCategory;

  @Prop({ type: [{ adminId: SchemaTypes.ObjectId, note: String, createdAt: Date }], default: [] })
  internalNotes: { adminId: Types.ObjectId; note: string; createdAt: Date }[];

  @Prop({ type: [{ fromAdmin: Boolean, message: String, createdAt: Date }], default: [] })
  conversationHistory: { fromAdmin: boolean; message: string; createdAt: Date }[];

  @Prop()
  resolvedAt?: Date;

  @Prop()
  closedAt?: Date;

  @Prop({ type: ComplianceEscalationSchema })
  compliance?: ComplianceEscalation;

  // Populated by the timestamps option — declared for typed access (Admin Feedback Management).
  createdAt?: Date;
}

export const FeedbackItemSchema = SchemaFactory.createForClass(FeedbackItem);
