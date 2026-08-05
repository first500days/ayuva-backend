import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

export type MedicationDocument = HydratedDocument<Medication>;

@Schema({ timestamps: true })
export class Medication {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  dosage: string;

  @Prop({ required: true })
  frequency: string;

  @Prop({ type: [String], default: [] })
  scheduleTimes: string[];

  @Prop({ default: 7 })
  refillThresholdDays: number;

  // Simple adherence-linked supply counter: decremented on each "taken" log,
  // compared against refillThresholdDays to drive GET /medications/refill-alerts
  // (PRD FR-10.4). Real inventory/pharmacy integration is out of scope for now.
  @Prop({ default: 30 })
  suppliesRemainingDays: number;

  @Prop({ default: true })
  active: boolean;
}

export const MedicationSchema = SchemaFactory.createForClass(Medication);
