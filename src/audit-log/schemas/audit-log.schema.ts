import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../core/users/schemas/user.schema';

export enum AuditAction {
  LOGIN = 'login',
  REGISTER = 'register',
  RECORD_UPLOAD = 'record_upload',
  RECORD_VIEW = 'record_view',
  RECORD_DOWNLOAD = 'record_download',
  RECORD_SHARE = 'record_share',
  ADMIN_USER_STATUS_CHANGE = 'admin_user_status_change',
  ADMIN_USER_CREATE = 'admin_user_create',
  ADMIN_USER_UPDATE = 'admin_user_update',
  ADMIN_PROVIDER_VERIFY = 'admin_provider_verify',
  ADMIN_PROVIDER_REJECT = 'admin_provider_reject',
  ADMIN_PROVIDER_SUSPEND = 'admin_provider_suspend',
  ADMIN_PROVIDER_ACTIVATE = 'admin_provider_activate',
  ADMIN_HOSPITAL_CREATE = 'admin_hospital_create',
  ADMIN_HOSPITAL_UPDATE = 'admin_hospital_update',
  ADMIN_HOSPITAL_VERIFY = 'admin_hospital_verify',
  ADMIN_HOSPITAL_REJECT = 'admin_hospital_reject',
  ADMIN_HOSPITAL_SUSPEND = 'admin_hospital_suspend',
  ADMIN_HOSPITAL_ACTIVATE = 'admin_hospital_activate',
  ADMIN_LAB_CREATE = 'admin_lab_create',
  ADMIN_LAB_UPDATE = 'admin_lab_update',
  ADMIN_LAB_VERIFY = 'admin_lab_verify',
  ADMIN_LAB_REJECT = 'admin_lab_reject',
  ADMIN_LAB_SUSPEND = 'admin_lab_suspend',
  ADMIN_LAB_ACTIVATE = 'admin_lab_activate',
  ADMIN_APPOINTMENT_UPDATE = 'admin_appointment_update',
  ADMIN_PAYMENT_REFUND = 'admin_payment_refund',
  ADMIN_ROLE_CREATE = 'admin_role_create',
  ADMIN_ROLE_UPDATE = 'admin_role_update',
  ADMIN_CONTENT_CREATE = 'admin_content_create',
  ADMIN_CONTENT_UPDATE = 'admin_content_update',
  ADMIN_CONTENT_PUBLISH = 'admin_content_publish',
  ADMIN_REPORT_REPROCESS = 'admin_report_reprocess',
  ADMIN_REPORT_ARCHIVE = 'admin_report_archive',
  ADMIN_AI_ESCALATION_UPDATE = 'admin_ai_escalation_update',
  PASSWORD_RESET_REQUESTED = 'password_reset_requested',
  PASSWORD_RESET_COMPLETED = 'password_reset_completed',
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
