import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Medication } from './medication.schema';

export enum MedicationLogStatus {
  TAKEN = 'taken',
  UPCOMING = 'upcoming',
  SKIPPED = 'skipped',
}

export type MedicationLogDocument = HydratedDocument<MedicationLog>;

@Schema({ timestamps: true })
export class MedicationLog {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: Medication.name,
    required: true,
    index: true,
  })
  medicationId: Types.ObjectId;

  @Prop({ required: true })
  scheduledAt: Date;

  @Prop({
    type: String,
    enum: MedicationLogStatus,
    default: MedicationLogStatus.UPCOMING,
  })
  status: MedicationLogStatus;

  @Prop()
  actionedAt?: Date;
}

export const MedicationLogSchema = SchemaFactory.createForClass(MedicationLog);
