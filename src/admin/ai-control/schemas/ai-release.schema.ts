import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AiReleaseDocument = HydratedDocument<AiRelease>;

@Schema({ timestamps: true })
export class AiRelease {
  @Prop({ required: true })
  versionTag: string; // e.g. "v2.1.4"

  @Prop({ required: true })
  summary: string;

  @Prop({ type: String, enum: ['draft', 'tested', 'approved', 'released', 'retired', 'rolled_back'], default: 'draft' })
  status: 'draft' | 'tested' | 'approved' | 'released' | 'retired' | 'rolled_back';

  @Prop({ required: true })
  author: string;

  @Prop()
  approvedBy?: string;

  @Prop({ type: Object })
  surfacesSnapshot: Record<string, any>;

  @Prop({ default: 0 })
  trafficPercent: number;

  @Prop({ default: 0 })
  evalScore: number;

  @Prop()
  releasedAt?: Date;
}

export const AiReleaseSchema = SchemaFactory.createForClass(AiRelease);
