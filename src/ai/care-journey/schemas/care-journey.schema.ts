import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../../core/users/schemas/user.schema';
import { TriageResult } from '../../symptom-nav/schemas/triage-result.schema';

export enum CareStepStatus {
  DONE = 'done',
  CURRENT = 'current',
  UPCOMING = 'upcoming',
}

export enum CareJourneyStatus {
  ACTIVE = 'active',
  RESOLVED = 'resolved',
  CANCELLED = 'cancelled',
}

@Schema({ _id: false })
export class CareStep {
  @Prop({ required: true })
  name: string;

  @Prop({
    type: String,
    enum: CareStepStatus,
    default: CareStepStatus.UPCOMING,
  })
  status: CareStepStatus;

  @Prop()
  contextNote?: string;
}
export const CareStepSchema = SchemaFactory.createForClass(CareStep);

export type CareJourneyDocument = HydratedDocument<CareJourney>;

@Schema({ timestamps: true })
export class CareJourney {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: TriageResult.name })
  triageResultId?: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ type: [CareStepSchema], default: [] })
  steps: CareStep[];

  @Prop({ default: 0 })
  progressPct: number;

  @Prop({
    type: String,
    enum: CareJourneyStatus,
    default: CareJourneyStatus.ACTIVE,
    index: true,
  })
  status: CareJourneyStatus;
}

export const CareJourneySchema = SchemaFactory.createForClass(CareJourney);
