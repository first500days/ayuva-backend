import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AiSurfaceConfigDocument = HydratedDocument<AiSurfaceConfig>;

@Schema({ timestamps: true })
export class AiSurfaceConfig {
  @Prop({ required: true, unique: true, index: true })
  surfaceKey: string; // 'navigation' | 'symptom_triage' | 'appointment_discovery' | 'report_interpreter' | 'records_organizer'

  @Prop({ required: true })
  displayName: string;

  @Prop({ required: true })
  model: string; // 'gemini-1.5-pro' | 'gemini-1.5-flash'

  @Prop({ default: 0.2 })
  temperature: number;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({ type: [String], default: [] })
  safetyGuards: string[];

  @Prop({ type: [String], default: [] })
  fallbackResponses: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 'v1.0.0' })
  version: string;
}

export const AiSurfaceConfigSchema = SchemaFactory.createForClass(AiSurfaceConfig);
