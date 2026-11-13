import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** Which hospital store holds the item. */
export enum StoreKind {
  PHARMACY = 'pharmacy',
  CENTRAL = 'central',
}

/** Indian Drugs & Cosmetics Rules schedule printed on the pack. */
export const DRUG_SCHEDULES = ['otc', 'G', 'H', 'H1', 'X'] as const;

export const CENTRAL_CATEGORIES = [
  'consumable',
  'surgical',
  'implant',
  'linen',
  'other',
] as const;

/** One delivery of an item: its own batch number, expiry and price. */
@Schema({ _id: true })
export class StockBatch {
  _id: Types.ObjectId;

  @Prop({ required: true, trim: true }) batchNo: string;
  @Prop() expiryDate?: Date;
  @Prop({ required: true, min: 0 }) quantity: number;
  // Purchase cost per unit.
  @Prop({ min: 0 }) unitCost?: number;
  // Printed maximum retail price per unit (medicines).
  @Prop({ min: 0 }) mrp?: number;
  @Prop({ trim: true }) supplier?: string;
  @Prop({ trim: true }) invoiceNo?: string;
  @Prop({ required: true }) receivedAt: Date;
  // Serialised devices (implants): the serial numbers still in stock.
  @Prop({ type: [String], default: undefined }) serials?: string[];
}
export const StockBatchSchema = SchemaFactory.createForClass(StockBatch);

/** The latest reorder request sent to the supplier (stores and the lab inventory). */
@Schema({ _id: false })
export class SupplierReorder {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true, min: 1 }) quantity: number;
  @Prop({ required: true }) ref: string;
  @Prop() byName?: string;
  /** True when the WhatsApp Business API sent it; false when staff were handed a WhatsApp link to send. */
  @Prop({ default: false }) sent: boolean;
}
export const SupplierReorderSchema =
  SchemaFactory.createForClass(SupplierReorder);

export type StockItemDocument = HydratedDocument<StockItem>;

/**
 * A stocked item in the hospital pharmacy (medicines) or central supply
 * (consumables, surgical items, implants). `quantity` is the sum of the
 * batches and is only ever changed together with a batch, atomically.
 */
@Schema({ timestamps: true, collection: 'partner_stock_items' })
export class StockItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ type: String, enum: StoreKind, required: true })
  store: StoreKind;

  @Prop({ required: true, trim: true }) name: string;
  // Item / SKU code.
  @Prop({ trim: true }) code?: string;

  // Medicines
  @Prop({ trim: true }) genericName?: string;
  @Prop({ trim: true }) form?: string;
  @Prop({ trim: true }) strength?: string;
  @Prop({ type: String, enum: DRUG_SCHEDULES }) schedule?: string;

  // Central supply: consumable | surgical | implant | linen | other; medicines: 'medicine'.
  @Prop({ required: true, default: 'consumable' }) category: string;
  // Every unit has its own serial number (implants, some devices).
  @Prop({ default: false }) serialised: boolean;

  @Prop({ required: true, default: 'units', trim: true }) unit: string;
  @Prop({ default: 0, min: 0 }) reorderLevel: number;
  @Prop({ trim: true }) location?: string;

  @Prop({ required: true, default: 0 }) quantity: number;

  @Prop({ type: [StockBatchSchema], default: [] })
  batches: StockBatch[];

  // Usual supplier, for one-click reorders over WhatsApp.
  @Prop({ trim: true }) supplierName?: string;
  /** E.164. */
  @Prop({ trim: true }) supplierWhatsapp?: string;
  @Prop({ type: SupplierReorderSchema, default: undefined })
  lastReorder?: SupplierReorder;

  @Prop({ default: true }) active: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StockItemSchema = SchemaFactory.createForClass(StockItem);
StockItemSchema.index({ providerId: 1, store: 1, name: 1 });
