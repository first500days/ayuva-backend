import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { StoreKind } from './stock-item.schema';

export const STOCK_REASONS = [
  'received',
  'dispensed',
  'issued',
  'returned',
  'adjusted',
  'expired',
  'damaged',
] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

/** What a movement was for: a prescription, a ward or department, an OT case, a patient. */
@Schema({ _id: false })
export class StockRef {
  // 'prescription' | 'department' | 'ward' | 'ot_case' | 'patient' | 'supplier'
  @Prop({ required: true }) type: string;
  @Prop() id?: string;
  @Prop({ required: true }) label: string;
}
export const StockRefSchema = SchemaFactory.createForClass(StockRef);

export type StockMoveDocument = HydratedDocument<StockMove>;

/** Append-only stock ledger: every receipt, issue and correction, never edited. */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'partner_stock_moves',
})
export class StockMove {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;

  @Prop({ type: String, enum: StoreKind, required: true })
  store: StoreKind;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'StockItem', required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true }) itemName: string;
  @Prop() batchNo?: string;
  @Prop() expiryDate?: Date;

  // Units in (+) or out (−).
  @Prop({ required: true }) delta: number;
  // Item total after this movement.
  @Prop({ required: true }) balance: number;

  @Prop({ type: String, enum: STOCK_REASONS, required: true })
  reason: StockReason;

  @Prop({ type: StockRefSchema }) ref?: StockRef;

  // Implant traceability: which serials went to which patient.
  @Prop({ type: [String], default: undefined }) serials?: string[];
  @Prop() patientName?: string;

  @Prop({ trim: true }) note?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  byMemberId?: Types.ObjectId;
  @Prop() byName?: string;

  createdAt?: Date;
}

export const StockMoveSchema = SchemaFactory.createForClass(StockMove);
StockMoveSchema.index({ providerId: 1, store: 1, createdAt: -1 });
StockMoveSchema.index({ providerId: 1, itemId: 1, createdAt: -1 });
