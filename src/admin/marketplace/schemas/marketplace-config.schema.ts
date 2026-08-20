import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarketplaceConfigDocument = HydratedDocument<MarketplaceConfig>;

@Schema({ timestamps: true })
export class MarketplaceConfig {
  @Prop({ default: 30 })
  distanceWeight: number;

  @Prop({ default: 25 })
  ratingWeight: number;

  @Prop({ default: 25 })
  availabilityWeight: number;

  @Prop({ default: 20 })
  responseTimeWeight: number;

  @Prop({ default: true })
  strictSponsoredSeparation: boolean;

  @Prop({ default: 24 })
  staleSlotThresholdHours: number;

  @Prop({ default: 7 })
  priceSourceFreshnessDays: number;
}

export const MarketplaceConfigSchema = SchemaFactory.createForClass(MarketplaceConfig);
