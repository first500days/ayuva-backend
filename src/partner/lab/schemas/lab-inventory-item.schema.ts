import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class StockMovement {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) delta: number;
  // 'received' | 'used' | 'expired' | 'adjustment'
  @Prop({ required: true }) reason: string;
  @Prop() note?: string;
  @Prop() byName?: string;
  @Prop() balance?: number;
}
export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

export type LabInventoryItemDocument = HydratedDocument<LabInventoryItem>;

/** Reagent / consumable stock with reorder alerts (Inventory Management). */
@Schema({ timestamps: true, collection: 'partner_lab_inventory' })
export class LabInventoryItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  sku?: string;

  // 'reagent' | 'consumable' | 'kit' | 'equipment'
  @Prop({ required: true, default: 'consumable' })
  category: string;

  @Prop({ required: true, default: 'units', trim: true })
  unit: string;

  @Prop({ required: true, default: 0 })
  quantity: number;

  @Prop({ default: 0, min: 0 })
  reorderLevel: number;

  @Prop()
  expiryDate?: Date;

  @Prop({ trim: true })
  lotNumber?: string;

  @Prop({ trim: true })
  supplier?: string;

  @Prop({ trim: true })
  location?: string;

  // Most recent movements only (capped), newest last.
  @Prop({ type: [StockMovementSchema], default: [] })
  movements: StockMovement[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const LabInventoryItemSchema =
  SchemaFactory.createForClass(LabInventoryItem);
