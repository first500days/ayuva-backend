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

  // Populated by the timestamps option — declared for typed access (Admin Feedback Management).
  createdAt?: Date;
}

export const FeedbackItemSchema = SchemaFactory.createForClass(FeedbackItem);
