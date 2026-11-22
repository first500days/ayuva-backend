import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum SurfaceVersionStatus {
  // The configuration the surface runs on now (one per surface).
  LIVE = 'live',
  // Replaced by a newer save; a candidate for "Rollback to Last Stable Prompt".
  SUPERSEDED = 'superseded',
  // Taken off live by a rollback — never offered as a rollback target again.
  ROLLED_BACK = 'rolled_back',
}

export type AiSurfaceVersionDocument = HydratedDocument<AiSurfaceVersion>;

/**
 * Immutable snapshot of a surface's prompt configuration each time it goes
 * live. Lets the AI Control Center roll a bad prompt back in one step and
 * lets compliance name the exact prompt version behind any AI output.
 */
@Schema({ collection: 'ai_surface_versions' })
export class AiSurfaceVersion {
  @Prop({ required: true, index: true })
  surfaceKey: string;

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  model: string;

  @Prop({ required: true })
  temperature: number;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({ type: [String], default: [] })
  safetyGuards: string[];

  @Prop({ type: [String], default: [] })
  fallbackResponses: string[];

  @Prop({ type: String, enum: SurfaceVersionStatus, required: true, index: true })
  status: SurfaceVersionStatus;

  // When this configuration was first saved and went live.
  @Prop({ required: true })
  activatedAt: Date;

  @Prop()
  activatedBy?: string;

  @Prop()
  supersededAt?: Date;

  // Set when a rollback brings this version back live.
  @Prop()
  restoredAt?: Date;

  @Prop()
  rolledBackAt?: Date;

  @Prop()
  rolledBackBy?: string;

  @Prop()
  rollbackReason?: string;
}

export const AiSurfaceVersionSchema = SchemaFactory.createForClass(AiSurfaceVersion);
AiSurfaceVersionSchema.index({ surfaceKey: 1, status: 1, supersededAt: -1 });
