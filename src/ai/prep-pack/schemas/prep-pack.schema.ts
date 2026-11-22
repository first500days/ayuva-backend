import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PrepPackDocument = HydratedDocument<PrepPack>;

@Schema({ timestamps: true })
export class PrepPack {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, index: true })
  appointmentId: string;

  @Prop({ type: Object, default: [] })
  sections: Record<string, unknown>[];

  // What the patient wants the doctor to know, in their own words.
  @Prop({ maxlength: 2000 })
  symptomNotes?: string;

  // Item id → whether the patient chose to include it (overrides the default).
  @Prop({ type: Object })
  included?: Record<string, boolean>;

  // The patient chose to send their notes, questions and chosen items to the
  // appointment's clinic before the visit (Partner Portal pre-visit bundle).
  @Prop({ default: false })
  sendToClinic: boolean;
}

export const PrepPackSchema = SchemaFactory.createForClass(PrepPack);
PrepPackSchema.index({ userId: 1, appointmentId: 1 }, { unique: true });
