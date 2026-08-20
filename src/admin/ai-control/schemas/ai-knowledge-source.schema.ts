import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AiKnowledgeSourceDocument = HydratedDocument<AiKnowledgeSource>;

@Schema({ timestamps: true })
export class AiKnowledgeSource {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  category: string; // 'clinical_guidelines' | 'drug_interactions' | 'lab_ranges' | 'hospital_protocols'

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  sourceUrlOrProvider: string;

  @Prop({ default: true })
  isVerified: boolean;

  @Prop({ default: 0 })
  vectorCount: number;

  @Prop({ default: Date.now })
  lastSyncedAt: Date;
}

export const AiKnowledgeSourceSchema = SchemaFactory.createForClass(AiKnowledgeSource);
