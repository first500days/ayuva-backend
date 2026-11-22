import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * When to remind a patient that a signed prescription's course is nearly done
 * (85 %). Kept beside the prescription, never on it: a signed e-Rx is immutable.
 */
@Schema({ timestamps: true, collection: 'rx_refill_prompts' })
export class RxRefillPrompt {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Prescription',
    required: true,
    unique: true,
  })
  prescriptionId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;

  /** Null when the course has no set end (nothing to remind about). */
  @Prop({ type: Date, default: null, index: true }) promptAt: Date | null;

  @Prop() sentAt?: Date;

  /** Why no push went: the patient already booked a follow-up. */
  @Prop() skipped?: string;
}

export type RxRefillPromptDocument = HydratedDocument<RxRefillPrompt>;
export const RxRefillPromptSchema =
  SchemaFactory.createForClass(RxRefillPrompt);
