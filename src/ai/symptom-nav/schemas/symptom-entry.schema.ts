import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../../core/users/schemas/user.schema';

export type SymptomEntryDocument = HydratedDocument<SymptomEntry>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class SymptomEntry {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  rawText: string;

  @Prop({ required: true })
  durationDays: number;

  // LLM NLU output, shown back to the user for transparency before triage (FR-4.3).
  @Prop({ type: [String], default: [] })
  extractedSymptoms: string[];
}

export const SymptomEntrySchema = SchemaFactory.createForClass(SymptomEntry);
