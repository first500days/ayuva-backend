import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum QualityFlagSeverity {
  CRITICAL = 'critical',
  WARNING = 'warning',
  INFO = 'info',
}

export type MarketplaceQualityFlagDocument = HydratedDocument<MarketplaceQualityFlag>;

@Schema({ timestamps: true })
export class MarketplaceQualityFlag {
  @Prop({ required: true })
  entityType: 'hospital' | 'provider' | 'lab' | 'test';

  @Prop({ required: true })
  entityId: string;

  @Prop({ required: true })
  entityName: string;

  @Prop({ required: true })
  issueType: string;

  @Prop({ required: true })
  details: string;

  @Prop({ type: String, enum: QualityFlagSeverity, default: QualityFlagSeverity.WARNING })
  severity: QualityFlagSeverity;

  @Prop({ default: false })
  isResolved: boolean;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  resolvedBy?: string;
}

export const MarketplaceQualityFlagSchema = SchemaFactory.createForClass(MarketplaceQualityFlag);
