import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class AnalyserCode {
  /** The analyser's test code, e.g. "GLU". */
  @Prop({ required: true, trim: true }) code: string;
  /** The report parameter it fills, e.g. "Glucose (Fasting)". */
  @Prop({ required: true, trim: true }) parameter: string;
}
export const AnalyserCodeSchema = SchemaFactory.createForClass(AnalyserCode);

export type LabAnalyserDocument = HydratedDocument<LabAnalyser>;

/** A lab instrument that sends results through the on-site bridge. */
@Schema({ timestamps: true, collection: 'partner_lab_analysers' })
export class LabAnalyser {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true }) name: string;
  @Prop({ required: true }) protocol: string;
  /** SHA-256 of the bridge key; the key itself is shown once. */
  @Prop({ required: true, unique: true }) keyHash: string;
  @Prop({ required: true }) keyHint: string;
  @Prop({ type: [AnalyserCodeSchema], default: [] }) codes: AnalyserCode[];
  @Prop({ default: true }) active: boolean;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  createdByUserId: Types.ObjectId;
  @Prop() lastMessageAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export const LabAnalyserSchema = SchemaFactory.createForClass(LabAnalyser);

@Schema({ _id: false })
export class AnalyserMessageItem {
  @Prop({ required: true }) barcode: string;
  @Prop() orderNo?: string;
  @Prop({ default: 0 }) applied: number;
  /** Values resent that were already on the report. */
  @Prop({ default: 0 }) unchanged: number;
  /** "GLU: no matching parameter", "CREA: already entered as 1.0" … */
  @Prop({ type: [String], default: [] }) skipped: string[];
}
export const AnalyserMessageItemSchema =
  SchemaFactory.createForClass(AnalyserMessageItem);

export type AnalyserMessageDocument = HydratedDocument<AnalyserMessage>;

/** Every message received, with what became of it (for troubleshooting interfaces). */
@Schema({ timestamps: true, collection: 'partner_lab_analyser_messages' })
export class AnalyserMessage {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'LabAnalyser', required: true })
  analyserId: Types.ObjectId;
  @Prop({ required: true }) protocol: string;
  @Prop() controlId?: string;
  /** The message as received, cut to 20 000 characters. */
  @Prop({ required: true }) raw: string;
  /** applied / partial / unmatched / error */
  @Prop({ required: true }) status: string;
  @Prop() error?: string;
  @Prop({ type: [AnalyserMessageItemSchema], default: [] })
  items: AnalyserMessageItem[];
  @Prop({ default: false }) test: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}
export const AnalyserMessageSchema =
  SchemaFactory.createForClass(AnalyserMessage);
AnalyserMessageSchema.index({ providerId: 1, analyserId: 1, createdAt: -1 });
