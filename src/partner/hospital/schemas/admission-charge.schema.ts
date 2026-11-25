import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { CHARGE_CATEGORIES, type ChargeCategory } from './service-price.schema';

/**
 * Something given to an admitted patient and billed: a medicine, a product,
 * a bed day, a procedure. Name, price and tax are copied from the price list
 * when added. Like desk receipts, a mistake is voided with a reason, never
 * deleted.
 */
@Schema({ timestamps: true, collection: 'partner_admission_charges' })
export class PartnerAdmissionCharge {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'PartnerAdmission',
    required: true,
    index: true,
  })
  admissionId: Types.ObjectId;

  // Set for patients with an AYUVA (or desk) record; walk-ins have only the admission.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) patientId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerServicePrice' })
  serviceId?: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;

  @Prop({ type: String, enum: CHARGE_CATEGORIES, default: 'other' })
  category: ChargeCategory;

  @Prop({ trim: true, default: 'each' }) unit: string;

  @Prop({ required: true, min: 0 }) unitPrice: number;

  @Prop({ required: true, min: 0 }) quantity: number;

  @Prop({ default: 0, min: 0, max: 40 }) taxPct: number;

  // quantity × unitPrice, then the tax on it; rounded to paise.
  @Prop({ required: true }) amount: number;
  @Prop({ required: true }) tax: number;
  @Prop({ required: true }) total: number;

  // When it was given (defaults to when it was added).
  @Prop({ required: true }) givenAt: Date;

  @Prop({ trim: true }) note?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  addedByMemberId?: Types.ObjectId;
  @Prop() addedByName?: string;

  // A voided line stays on the bill's history, but counts for nothing.
  @Prop() voidedAt?: Date;
  @Prop() voidedByName?: string;
  @Prop() voidReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type PartnerAdmissionChargeDocument =
  HydratedDocument<PartnerAdmissionCharge>;
export const PartnerAdmissionChargeSchema = SchemaFactory.createForClass(
  PartnerAdmissionCharge,
);
