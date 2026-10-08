import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/** One reported parameter of a test, with its reference interval (drives the Report Builder). */
@Schema({ _id: false })
export class LabParameter {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ trim: true }) unit?: string;
  @Prop() refLow?: number;
  @Prop() refHigh?: number;
  // Free-text range for non-numeric results, e.g. "Negative", "Clear".
  @Prop({ trim: true }) refText?: string;
  @Prop() criticalLow?: number;
  @Prop() criticalHigh?: number;
}
export const LabParameterSchema = SchemaFactory.createForClass(LabParameter);

export type LabCatalogItemDocument = HydratedDocument<LabCatalogItem>;

/** A test or package a diagnostic centre offers: price, turnaround, sample and report parameters. */
@Schema({ timestamps: true, collection: 'partner_lab_tests' })
export class LabCatalogItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  // e.g. Haematology, Biochemistry, Radiology, Package.
  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ trim: true })
  sampleType?: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ min: 0 })
  mrp?: number;

  @Prop({ default: 24, min: 0 })
  tatHours: number;

  @Prop({ default: false })
  homeCollection: boolean;

  @Prop({ default: false })
  fastingRequired: boolean;

  @Prop({ default: '' })
  preparation: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: false })
  isPackage: boolean;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'LabCatalogItem', default: [] })
  includes: Types.ObjectId[];

  @Prop({ type: [LabParameterSchema], default: [] })
  parameters: LabParameter[];

  @Prop({ default: true, index: true })
  active: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LabCatalogItemSchema =
  SchemaFactory.createForClass(LabCatalogItem);
LabCatalogItemSchema.index({ providerId: 1, code: 1 }, { unique: true });
