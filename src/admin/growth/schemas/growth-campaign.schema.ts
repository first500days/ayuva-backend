import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum CampaignPlacement {
  PUBLIC_WEBSITE = 'public_website',
  USER_APP = 'user_app',
  MARKETPLACE_BANNER = 'marketplace_banner',
}

export enum CampaignStatus {
  DRAFT = 'draft',
  REVIEW = 'review',
  SCHEDULED = 'scheduled',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ENDED = 'ended',
  ARCHIVED = 'archived',
}

export type GrowthCampaignDocument = HydratedDocument<GrowthCampaign>;

@Schema({ timestamps: true })
export class GrowthCampaign {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  sponsorName: string;

  @Prop({ type: String, enum: CampaignPlacement, required: true })
  placement: CampaignPlacement;

  @Prop({ type: String, enum: CampaignStatus, default: CampaignStatus.DRAFT, index: true })
  status: CampaignStatus;

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop({ default: 0 })
  budget: number;

  @Prop({ default: 0 })
  spent: number;

  @Prop({ required: true })
  headline: string;

  @Prop({ required: true })
  subtext: string;

  @Prop({ default: 'Learn More' })
  ctaText: string;

  @Prop({ required: true })
  ctaUrl: string;

  @Prop()
  imageUrl?: string;

  @Prop({ type: [String], default: [] })
  targetSpecialties: string[];

  @Prop({ type: [String], default: [] })
  targetLocations: string[];

  @Prop({ default: true })
  sponsoredBadgeVisible: boolean; // Trust guardrail: must always be true

  @Prop({ default: 0 })
  impressions: number;

  @Prop({ default: 0 })
  clicks: number;

  @Prop({ default: 0 })
  conversions: number;

  @Prop({ default: 0 })
  revenueGenerated: number;

  @Prop()
  approvedBy?: string;

  @Prop()
  approvedAt?: Date;
}

export const GrowthCampaignSchema = SchemaFactory.createForClass(GrowthCampaign);
