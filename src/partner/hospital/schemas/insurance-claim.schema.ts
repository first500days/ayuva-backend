import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** Claim lifecycle — a TPA/insurer can raise a query before deciding. */
export enum ClaimStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  QUERY = 'query',
  APPROVED = 'approved',
  PARTIALLY_APPROVED = 'partially_approved',
  REJECTED = 'rejected',
  SETTLED = 'settled',
}

@Schema({ _id: false })
export class ClaimEvent {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) status: string;
  @Prop() byName?: string;
  @Prop() note?: string;
}
export const ClaimEventSchema = SchemaFactory.createForClass(ClaimEvent);

export type InsuranceClaimDocument = HydratedDocument<InsuranceClaim>;

/** Insurance / TPA claim tracked by the hospital's billing desk (Billing & Claims). */
@Schema({ timestamps: true, collection: 'partner_insurance_claims' })
export class InsuranceClaim {
  @Prop({ required: true, unique: true })
  claimNo: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  patientId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  patientName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerAdmission' })
  admissionId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  payer: string;

  @Prop({ trim: true }) policyNumber?: string;
  @Prop({ trim: true }) payerClaimRef?: string;

  // 'cashless' | 'reimbursement'
  @Prop({ default: 'cashless' })
  claimType: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ required: true, min: 0 })
  amountClaimed: number;

  @Prop({ min: 0 }) amountApproved?: number;
  @Prop({ min: 0 }) amountSettled?: number;

  @Prop({
    type: String,
    enum: ClaimStatus,
    default: ClaimStatus.DRAFT,
    index: true,
  })
  status: ClaimStatus;

  @Prop() submittedAt?: Date;
  @Prop() decidedAt?: Date;
  @Prop() settledAt?: Date;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: [ClaimEventSchema], default: [] })
  history: ClaimEvent[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const InsuranceClaimSchema =
  SchemaFactory.createForClass(InsuranceClaim);
InsuranceClaimSchema.index({ providerId: 1, status: 1, createdAt: -1 });
