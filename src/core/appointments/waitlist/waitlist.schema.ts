import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** A patient waiting for an opening with a provider, optionally within a range of days. */
@Schema({ timestamps: true, collection: 'appointment_waitlist' })
export class WaitlistEntry {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  /** YYYY-MM-DD, inclusive. */
  @Prop() fromDay?: string;

  @Prop() toDay?: string;

  @Prop({
    type: String,
    enum: ['waiting', 'left'],
    default: 'waiting',
    index: true,
  })
  status: 'waiting' | 'left';

  @Prop() lastNotifiedAt?: Date;

  @Prop({ default: 0 }) notifiedCount: number;

  createdAt?: Date;
}

export type WaitlistEntryDocument = HydratedDocument<WaitlistEntry>;
export const WaitlistEntrySchema = SchemaFactory.createForClass(WaitlistEntry);
WaitlistEntrySchema.index({ providerId: 1, status: 1, createdAt: 1 });
