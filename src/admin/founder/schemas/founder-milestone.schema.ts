import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FounderMilestoneDocument = HydratedDocument<FounderMilestone>;

@Schema({ timestamps: true })
export class FounderMilestone {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  targetQuarter: string; // e.g. "Q3 2026", "Q4 2026"

  @Prop({ type: String, enum: ['planned', 'in_progress', 'completed', 'blocked'], default: 'planned' })
  status: 'planned' | 'in_progress' | 'completed' | 'blocked';

  @Prop({ required: true })
  owner: string;

  @Prop({ default: 0 })
  progressPercent: number;

  @Prop()
  notes?: string;
}

export const FounderMilestoneSchema = SchemaFactory.createForClass(FounderMilestone);
