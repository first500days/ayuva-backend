import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AiSurfaceConfigDocument = HydratedDocument<AiSurfaceConfig>;

// Pause on every document type, not just one.
export const ALL_RECORD_TYPES = '*';

/**
 * A compliance hold: the surface does not run on this record type until a
 * manual review clears it (e.g. after a patient reports a misread ECG).
 */
@Schema({ _id: false })
export class SurfacePause {
  // A MedicalRecordType value, or ALL_RECORD_TYPES.
  @Prop({ required: true })
  recordType: string;

  @Prop({ required: true })
  reason: string;

  // The prompt version that was live when the hold was placed.
  @Prop({ required: true })
  promptVersion: string;

  // e.g. the feedback ticket that triggered a compliance escalation.
  @Prop()
  caseRef?: string;

  @Prop({ required: true })
  pausedAt: Date;

  @Prop()
  pausedBy?: string;
}
export const SurfacePauseSchema = SchemaFactory.createForClass(SurfacePause);

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

  // Server-owned: bumped on every prompt change, restored by a rollback.
  @Prop({ default: 'v1.0.0' })
  version: string;

  @Prop({ type: [SurfacePauseSchema], default: [] })
  pauses: SurfacePause[];

  createdAt?: Date;
  updatedAt?: Date;
}

export const AiSurfaceConfigSchema = SchemaFactory.createForClass(AiSurfaceConfig);
