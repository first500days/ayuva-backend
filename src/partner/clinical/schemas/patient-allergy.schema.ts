import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export const ALLERGY_SEVERITIES = [
  'mild',
  'moderate',
  'severe',
  'anaphylaxis',
  'unknown',
] as const;

export type PatientAllergyDocument = HydratedDocument<PatientAllergy>;

/**
 * An allergy recorded by the organisation's clinicians (alongside what the
 * patient reported in their own health profile), or a "no known drug
 * allergies" confirmation. Entries are never deleted: a mistaken one is
 * marked removed with who and why.
 */
@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'partner_patient_allergies',
})
export class PatientAllergy {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Provider', required: true })
  providerId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  patientId: Types.ObjectId;

  // 'allergy' | 'nkda' (no known drug allergies, confirmed with the patient)
  @Prop({ required: true, default: 'allergy' }) kind: string;

  @Prop({ trim: true }) substance?: string;
  @Prop({ trim: true }) reaction?: string;
  @Prop({ type: String, enum: ALLERGY_SEVERITIES }) severity?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  recordedByMemberId?: Types.ObjectId;
  @Prop() recordedByName?: string;

  @Prop() removedAt?: Date;
  @Prop() removedByName?: string;
  @Prop() removeReason?: string;

  createdAt?: Date;
}

export const PatientAllergySchema =
  SchemaFactory.createForClass(PatientAllergy);
PatientAllergySchema.index({ providerId: 1, patientId: 1, removedAt: 1 });
