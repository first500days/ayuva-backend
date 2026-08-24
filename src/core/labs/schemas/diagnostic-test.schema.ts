import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class DiagnosticTestProviderPricing {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Lab', required: true })
  labId: Types.ObjectId;

  @Prop({ required: true })
  labName: string;

  @Prop({ required: true })
  price: number;

  @Prop({ default: 0 })
  tatHours: number;

  @Prop({ default: true })
  homeCollection: boolean;

  @Prop({ default: true })
  isActive: boolean;
}
export const DiagnosticTestProviderPricingSchema = SchemaFactory.createForClass(DiagnosticTestProviderPricing);

export type DiagnosticTestDocument = HydratedDocument<DiagnosticTest>;

@Schema({ timestamps: true, collection: 'diagnostic_tests' })
export class DiagnosticTest {
  @Prop({ required: true, unique: true, index: true })
  testCode: string;

  @Prop({ required: true, index: true })
  testName: string;

  @Prop({ required: true, index: true })
  category: string;

  @Prop()
  sampleType: string;

  @Prop({ default: 0 })
  tatHours: number;

  @Prop({ default: 0 })
  standardPrice: number;

  @Prop({ default: false })
  homeCollectionAvailable: boolean;

  @Prop({ default: false })
  fastingRequired: boolean;

  @Prop({ type: [DiagnosticTestProviderPricingSchema], default: [] })
  providerPricing: DiagnosticTestProviderPricing[];

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  description: string;

  @Prop()
  preparationInstructions: string;

  @Prop()
  reportFormat: string;

  @Prop()
  referenceRange: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const DiagnosticTestSchema = SchemaFactory.createForClass(DiagnosticTest);

DiagnosticTestSchema.index({ testName: 'text', category: 'text', tags: 'text' });
DiagnosticTestSchema.index({ category: 1, isActive: 1 });