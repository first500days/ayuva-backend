import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** How a hospital bill is paid at the billing desk — one bill often uses several. */
export enum DeskPaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  UPI = 'upi',
  BANK_TRANSFER = 'bank_transfer',
  CHEQUE = 'cheque',
  INSURANCE = 'insurance',
  CORPORATE = 'corporate',
}

/** Shares an insurer or employer pays later, rather than money taken at the desk. */
export const CREDIT_METHODS: string[] = [
  DeskPaymentMethod.INSURANCE,
  DeskPaymentMethod.CORPORATE,
];

@Schema({ _id: false })
export class BillPaymentPart {
  @Prop({ type: String, enum: DeskPaymentMethod, required: true })
  method: DeskPaymentMethod;

  @Prop({ required: true, min: 0 })
  amount: number;

  // Card slip, UPI or cheque number.
  @Prop({ trim: true })
  reference?: string;

  // The insurance claim an insurance share is billed to.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'InsuranceClaim' })
  claimId?: Types.ObjectId;

  @Prop()
  claimNo?: string;
}
export const BillPaymentPartSchema =
  SchemaFactory.createForClass(BillPaymentPart);

export type BillPaymentDocument = HydratedDocument<PartnerBillPayment>;

/**
 * A bill settled at the hospital's billing desk (Billing & Claims). Unlike an
 * online Transaction it can be split across methods, e.g. cash + insurance,
 * and it never passes through Ayuva, so it carries no platform fee or payout.
 */
@Schema({ timestamps: true, collection: 'partner_bill_payments' })
export class PartnerBillPayment {
  @Prop({ required: true, unique: true })
  receiptNo: string;

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

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [BillPaymentPartSchema], required: true })
  parts: BillPaymentPart[];

  // Sum of the parts.
  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ required: true })
  receivedAt: Date;

  @Prop()
  recordedByName?: string;

  // A voided receipt stays on the ledger, but counts for nothing.
  @Prop()
  voidedAt?: Date;

  @Prop()
  voidedByName?: string;

  @Prop()
  voidReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PartnerBillPaymentSchema =
  SchemaFactory.createForClass(PartnerBillPayment);
PartnerBillPaymentSchema.index({ providerId: 1, receivedAt: -1 });
