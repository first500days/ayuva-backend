import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum ReferralStatus {
  SENT = 'sent',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ReferralType {
  CONSULTATION = 'consultation',
  DIAGNOSTIC = 'diagnostic',
  ADMISSION = 'admission',
  SECOND_OPINION = 'second_opinion',
}

export enum ReferralPriority {
  ROUTINE = 'routine',
  URGENT = 'urgent',
  EMERGENCY = 'emergency',
}

@Schema({ _id: false })
export class ExternalReferralTarget {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ trim: true, lowercase: true }) email?: string;
  @Prop({ trim: true }) phone?: string;
  @Prop({ trim: true }) address?: string;
}
export const ExternalReferralTargetSchema = SchemaFactory.createForClass(
  ExternalReferralTarget,
);

@Schema({ _id: false })
export class ReferralEvent {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) status: string;
  @Prop() byName?: string;
  @Prop() note?: string;
}
export const ReferralEventSchema = SchemaFactory.createForClass(ReferralEvent);

export type ReferralDocument = HydratedDocument<Referral>;

/**
 * Patient referral between organisations (Referral Outbox / Referral
 * Management). A referral never grants record access by itself — the patient
 * is asked to share their records with the receiving organisation.
 */
@Schema({ timestamps: true, collection: 'partner_referrals' })
export class Referral {
  @Prop({ required: true, unique: true })
  referralNo: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  fromProviderId: Types.ObjectId;

  @Prop({ required: true })
  fromProviderName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember', required: true })
  fromMemberId: Types.ObjectId;

  @Prop({ required: true })
  fromName: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    index: true,
    sparse: true,
  })
  toProviderId?: Types.ObjectId;

  @Prop({ required: true })
  toName: string;

  // 'clinic' | 'hospital' | 'diagnostic' for Ayuva partners, 'external' otherwise.
  @Prop({ required: true })
  toType: string;

  @Prop({ type: ExternalReferralTargetSchema })
  toExternal?: ExternalReferralTarget;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  patientName: string;

  @Prop({
    type: String,
    enum: ReferralType,
    default: ReferralType.CONSULTATION,
  })
  type: ReferralType;

  @Prop({
    type: String,
    enum: ReferralPriority,
    default: ReferralPriority.ROUTINE,
  })
  priority: ReferralPriority;

  @Prop({ required: true })
  reason: string;

  @Prop({ default: '' })
  clinicalSummary: string;

  @Prop({ type: [String], default: [] })
  requestedTests: string[];

  @Prop()
  department?: string;

  @Prop({
    type: String,
    enum: ReferralStatus,
    default: ReferralStatus.SENT,
    index: true,
  })
  status: ReferralStatus;

  @Prop()
  responseNote?: string;

  @Prop()
  respondedAt?: Date;

  @Prop()
  respondedByName?: string;

  @Prop()
  completedAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerLabOrder' })
  labOrderId?: Types.ObjectId;

  @Prop({ type: [ReferralEventSchema], default: [] })
  history: ReferralEvent[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReferralSchema = SchemaFactory.createForClass(Referral);
ReferralSchema.index({ fromProviderId: 1, createdAt: -1 });
ReferralSchema.index({ toProviderId: 1, status: 1, createdAt: -1 });
