import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum TaxonomyType {
  SPECIALTY = 'specialty',
  DIAGNOSTIC_CATEGORY = 'diagnostic_category',
  FACILITY = 'facility',
  SYMPTOM = 'symptom',
}

export type MarketplaceTaxonomyDocument = HydratedDocument<MarketplaceTaxonomy>;

@Schema({ timestamps: true })
export class MarketplaceTaxonomy {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, unique: true })
  slug: string;

  @Prop({ type: String, enum: TaxonomyType, required: true, index: true })
  type: TaxonomyType;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  entityCount: number;

  @Prop({ type: [String], default: [] })
  synonyms: string[];

  @Prop({ type: [String], default: [] })
  searchFacets: string[];
}

export const MarketplaceTaxonomySchema = SchemaFactory.createForClass(MarketplaceTaxonomy);
