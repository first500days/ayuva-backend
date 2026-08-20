import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FounderRiskDocument = HydratedDocument<FounderRisk>;

@Schema({ timestamps: true })
export class FounderRisk {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  category: 'regulatory' | 'clinical_safety' | 'financial' | 'cybersecurity' | 'market_competition';

  @Prop({ type: String, enum: ['high', 'medium', 'low'], default: 'medium' })
  impact: 'high' | 'medium' | 'low';

  @Prop({ type: String, enum: ['high', 'medium', 'low'], default: 'medium' })
  likelihood: 'high' | 'medium' | 'low';

  @Prop({ required: true })
  mitigationStrategy: string;

  @Prop({ required: true })
  owner: string;

  @Prop({ type: String, enum: ['active', 'mitigated', 'monitoring'], default: 'active' })
  status: 'active' | 'mitigated' | 'monitoring';
}

export const FounderRiskSchema = SchemaFactory.createForClass(FounderRisk);
