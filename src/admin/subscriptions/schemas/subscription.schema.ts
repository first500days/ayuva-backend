import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum PlanTier {
  FREE = 'free',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

export type PlanDocument = HydratedDocument<Plan>;

/** Free / Premium / Enterprise plan catalogue managed from the Admin Panel (A03). */
@Schema({ timestamps: true })
export class Plan {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: PlanTier, required: true, unique: true })
  tier: PlanTier;

  @Prop({ default: 0 })
  priceMonthly: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  // e.g. family members, storage GB, AI simplifications per month; null/absent = unlimited.
  @Prop({ type: SchemaTypes.Mixed, default: {} })
  limits: Record<string, number | null>;

  @Prop({ default: true })
  active: boolean;
}
export const PlanSchema = SchemaFactory.createForClass(Plan);

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export type SubscriptionDocument = HydratedDocument<Subscription>;

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: Plan.name, required: true, index: true })
  planId: Types.ObjectId;

  @Prop({ type: String, enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE, index: true })
  status: SubscriptionStatus;

  @Prop({ default: () => new Date() })
  startedAt: Date;

  @Prop()
  renewsAt?: Date;

  @Prop()
  cancelledAt?: Date;

  createdAt?: Date;
}
export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
