import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum IssueDomain {
  USER_APP = 'user_app',
  APPOINTMENTS = 'appointments',
  HOSPITALS = 'hospitals',
  LABS = 'labs',
  RECORDS = 'records',
  AI = 'ai',
  BILLING = 'billing',
  INTEGRATIONS = 'integrations',
}

export enum IssueSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

export enum IssueStatus {
  OPEN = 'open',
  TRIAGED = 'triaged',
  ASSIGNED = 'assigned',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  REOPENED = 'reopened',
}

export interface IssueTimelineEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  notes?: string;
}

export interface AffectedEntity {
  type: string;
  id?: string;
  name: string;
  identifier?: string;
}

export type AdminIssueDocument = HydratedDocument<AdminIssue>;

@Schema({ timestamps: true })
export class AdminIssue {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ type: String, enum: IssueDomain, required: true, index: true })
  domain: IssueDomain;

  @Prop({ type: String, enum: IssueSeverity, default: IssueSeverity.MEDIUM, index: true })
  severity: IssueSeverity;

  @Prop({ type: String, enum: IssueStatus, default: IssueStatus.OPEN, index: true })
  status: IssueStatus;

  @Prop({ default: 'Unassigned', index: true })
  assignedTo?: string;

  @Prop()
  slaDeadline?: string;

  @Prop({ type: Object, required: true })
  affectedEntity: AffectedEntity;

  @Prop({ type: [Object], default: [] })
  timeline: IssueTimelineEvent[];

  @Prop({ type: [String], default: [] })
  evidence: string[];

  @Prop()
  resolutionReason?: string;

  @Prop()
  resolutionOutcome?: string;

  @Prop()
  resolvedBy?: string;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const AdminIssueSchema = SchemaFactory.createForClass(AdminIssue);
