import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export const CHARGE_CATEGORIES = [
  'consultation',
  'room',
  'procedure',
  'medicine',
  'consumable',
  'investigation',
  'nursing',
  'other',
] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

/**
 * One line of the hospital's price list, set by its admin. Charges copy the
 * name, price and tax when they're added, so later price changes don't alter
 * a patient's bill.
 */
@Schema({ timestamps: true, collection: 'partner_service_prices' })
export class PartnerServicePrice {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;

  @Prop({ type: String, enum: CHARGE_CATEGORIES, default: 'other' })
  category: ChargeCategory;

  // Rupees per unit, before tax.
  @Prop({ required: true, min: 0 }) price: number;

  // "per day", "per tablet", "per visit"…
  @Prop({ trim: true, default: 'each' }) unit: string;

  // GST %, 0 by default (most healthcare services are exempt).
  @Prop({ default: 0, min: 0, max: 40 }) taxPct: number;

  @Prop({ default: true }) active: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export type PartnerServicePriceDocument = HydratedDocument<PartnerServicePrice>;
export const PartnerServicePriceSchema =
  SchemaFactory.createForClass(PartnerServicePrice);
PartnerServicePriceSchema.index({ providerId: 1, name: 1 }, { unique: true });
