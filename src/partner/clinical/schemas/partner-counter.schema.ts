import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** A per-organisation running number (e.g. hospital patient numbers), bumped atomically. */
@Schema({ collection: 'partner_counters' })
export class PartnerCounter {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;

  @Prop({ required: true }) key: string;

  @Prop({ default: 0 }) seq: number;
}

export type PartnerCounterDocument = HydratedDocument<PartnerCounter>;
export const PartnerCounterSchema =
  SchemaFactory.createForClass(PartnerCounter);
PartnerCounterSchema.index({ providerId: 1, key: 1 }, { unique: true });
