import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum TaxonomyType {
  SPECIALTY = 'specialty',
  DIAGNOSTIC_CATEGORY = 'diagnostic_category',
  FACILITY = 'facility',
  SYMPTOM = 'symptom',
}

/** Where a partner's own service wording came from. */
export enum ServiceSourceType {
  PROVIDER_SPECIALTY = 'provider_specialty',
  PROVIDER_DEPARTMENT = 'provider_department',
  HOSPITAL_SERVICE = 'hospital_service',
  LAB_TEST = 'lab_test',
  CUSTOM = 'custom',
}

/**
 * A partner's own service name bound to this category, e.g. a clinic's
 * "Heart Scan" under Cardiology. Patient search expands a category to its
 * mapped services, and a mapped service back to its category.
 */
@Schema()
export class MappedService {
  @Prop({ required: true, trim: true })
  serviceText: string;

  @Prop({ type: String, enum: ServiceSourceType, required: true })
  sourceType: ServiceSourceType;

  // The provider / hospital / lab offering it; absent for free-text mappings.
  @Prop({ type: SchemaTypes.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ trim: true })
  entityName?: string;

  @Prop({ trim: true })
  mappedBy?: string;

  @Prop({ required: true })
  mappedAt: Date;
}
export const MappedServiceSchema = SchemaFactory.createForClass(MappedService);

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

  @Prop({ type: [MappedServiceSchema], default: [] })
  mappedServices: (MappedService & { _id?: Types.ObjectId })[];
}

export const MarketplaceTaxonomySchema = SchemaFactory.createForClass(MarketplaceTaxonomy);
