import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../core/users/schemas/user.schema';

export enum AuditAction {
  LOGIN = 'login',
  REGISTER = 'register',
  RECORD_UPLOAD = 'record_upload',
  RECORD_VIEW = 'record_view',
  RECORD_DOWNLOAD = 'record_download',
  // Reserved for the Tier 2 patient-controlled record-sharing feature — not
  // emitted anywhere yet since that feature doesn't exist (PRD §7.1 Tier 2).
  RECORD_SHARE = 'record_share',
  ADMIN_USER_STATUS_CHANGE = 'admin_user_status_change',
}

export type AuditLogDocument = HydratedDocument<AuditLog>;

/**
 * Immutable, append-only compliance trail (TRD §7 "Audit Logs" — logins,
 * record access, document sharing, user actions). No admin UI in this
 * sprint; persisted and queryable directly is the requirement.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  actorId: Types.ObjectId;

  @Prop({ type: String, enum: AuditAction, required: true, index: true })
  action: AuditAction;

  // e.g. "User", "MedicalRecord" — the entity type the action was taken against.
  @Prop({ required: true })
  targetType: string;

  @Prop({ type: Types.ObjectId, index: true })
  targetId?: Types.ObjectId;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  ipAddress?: string;

  createdAt?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
