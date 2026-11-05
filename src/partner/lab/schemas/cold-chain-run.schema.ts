import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class TransitReading {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) tempC: number;
  /** "manual" (typed at pickup / handover) or "logger" (data-logger export). */
  @Prop({ required: true }) source: string;
  @Prop() byName?: string;
}
export const TransitReadingSchema =
  SchemaFactory.createForClass(TransitReading);

@Schema({ _id: false })
export class TransitVial {
  @Prop({ required: true }) barcode: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) orderId: Types.ObjectId;
  @Prop({ required: true }) orderNo: string;
  @Prop({ required: true }) patientName: string;
  @Prop({ required: true }) addedAt: Date;
}
export const TransitVialSchema = SchemaFactory.createForClass(TransitVial);

export type ColdChainRunDocument = HydratedDocument<ColdChainRun>;

/** One transport box's trip from home collections to the lab, with its temperature log. */
@Schema({ timestamps: true, collection: 'partner_cold_chain_runs' })
export class ColdChainRun {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true }) boxLabel: string;
  @Prop({ required: true }) preset: string;
  @Prop({ required: true }) minC: number;
  @Prop({ required: true }) maxC: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember', required: true })
  carrierMemberId: Types.ObjectId;
  @Prop({ required: true }) carrierName: string;

  @Prop({ required: true }) startedAt: Date;
  @Prop() endedAt?: Date;
  @Prop() closedByName?: string;
  @Prop({
    type: String,
    enum: ['open', 'closed'],
    default: 'open',
    index: true,
  })
  status: string;

  @Prop({ type: [TransitReadingSchema], default: [] })
  readings: TransitReading[];
  @Prop({ type: [TransitVialSchema], default: [] }) vials: TransitVial[];

  /** Set when the box is handed over: ok / excursion / no_data. */
  @Prop() verdict?: string;
  @Prop() minutesOut?: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ColdChainRunSchema = SchemaFactory.createForClass(ColdChainRun);
ColdChainRunSchema.index({ providerId: 1, 'vials.barcode': 1 });
