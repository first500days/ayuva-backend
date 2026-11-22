import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * draft     — written by the rules; editable; nothing has left the hospital.
 * ready     — approved by a person; waiting to be submitted through the payer's portal.
 * submitted — sent to the payer gateway (or marked as submitted by the desk).
 * then the payer's answer: approved | query | rejected; or cancelled.
 */
export enum PriorAuthStatus {
  DRAFT = 'draft',
  READY = 'ready',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  QUERY = 'query',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Schema({ _id: false })
export class PriorAuthDiagnosis {
  @Prop({ required: true }) icd11: string;
  @Prop({ required: true }) snomed: string;
  @Prop({ required: true }) display: string;
  /** Why the rules suggested it; empty when a person added it. */
  @Prop() evidence?: string;
}
const PriorAuthDiagnosisSchema =
  SchemaFactory.createForClass(PriorAuthDiagnosis);

@Schema({ _id: false })
export class PriorAuthProcedure {
  @Prop({ required: true }) name: string;
  /** The insurer's package code, filled in by the desk. */
  @Prop() packageCode?: string;
  @Prop() evidence?: string;
}
const PriorAuthProcedureSchema =
  SchemaFactory.createForClass(PriorAuthProcedure);

@Schema({ _id: false })
export class PriorAuthEvent {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) status: string;
  @Prop() byName?: string;
  @Prop() note?: string;
}
const PriorAuthEventSchema = SchemaFactory.createForClass(PriorAuthEvent);

export type PriorAuthDocument = HydratedDocument<PriorAuth>;

/**
 * Cashless pre-authorisation request for a referred patient. The rules draft it
 * from the referral and notes ("Provisional draft"); it is only ever sent after
 * a named person approves it, and that approval is audited.
 */
@Schema({ timestamps: true, collection: 'partner_prior_auths' })
export class PriorAuth {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Referral', index: true })
  referralId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  patientId: Types.ObjectId;

  @Prop({ required: true }) patientName: string;

  @Prop({ required: true, unique: true }) requestNo: string;

  @Prop({
    type: String,
    enum: PriorAuthStatus,
    default: PriorAuthStatus.DRAFT,
    index: true,
  })
  status: PriorAuthStatus;

  @Prop({ trim: true }) payer?: string;
  @Prop({ trim: true }) tpaName?: string;
  @Prop({ trim: true }) policyNumber?: string;

  @Prop({ type: [PriorAuthDiagnosisSchema], default: [] })
  diagnoses: PriorAuthDiagnosis[];

  @Prop({ type: [PriorAuthProcedureSchema], default: [] })
  procedures: PriorAuthProcedure[];

  @Prop({ min: 0 }) stayDays?: number;
  @Prop({ min: 0 }) estimatedAmount?: number;
  @Prop({ default: '' }) clinicalSummary: string;

  /** When the rules last (re)drafted it, and from what. */
  @Prop() draftedAt?: Date;
  @Prop({ type: [String], default: [] }) draftSources: string[];

  @Prop() approvedAt?: Date;
  @Prop() approvedByName?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  approvedByMemberId?: Types.ObjectId;

  @Prop() submittedAt?: Date;
  /** 'gateway' when it went to the configured payer endpoint, 'manual' when the desk submitted it. */
  @Prop() submittedVia?: string;
  @Prop() payerRef?: string;
  @Prop({ min: 0 }) amountApproved?: number;
  @Prop() decidedAt?: Date;

  @Prop({ type: [PriorAuthEventSchema], default: [] })
  history: PriorAuthEvent[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const PriorAuthSchema = SchemaFactory.createForClass(PriorAuth);
PriorAuthSchema.index({ providerId: 1, status: 1, createdAt: -1 });
