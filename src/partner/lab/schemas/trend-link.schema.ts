import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type TrendLinkDocument = HydratedDocument<TrendLink>;

/**
 * A patient's web link to their results over time at one lab. The token is
 * stored only as a hash; opening it also needs the last digits of the
 * patient's mobile number (or birth year), with a lockout on wrong answers.
 */
@Schema({ timestamps: true, collection: 'partner_trend_links' })
export class TrendLink {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerLabOrder', required: true })
  orderId: Types.ObjectId;

  @Prop({ required: true, unique: true }) tokenHash: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop() revokedAt?: Date;
  @Prop() createdByName?: string;

  @Prop({ default: 0 }) views: number;
  @Prop() lastViewedAt?: Date;
  @Prop({ default: 0 }) failedChecks: number;
  @Prop() lockedUntil?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export const TrendLinkSchema = SchemaFactory.createForClass(TrendLink);
