import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

/**
 * A patient registered at this organisation's desk by scanning their AYUVA
 * profile QR. It links the patient to the organisation (so they appear in its
 * patient list for booking, orders and admission) and gives it the basics on
 * the QR only: name, time zone, emergency contact. Never their records.
 */
@Schema({ timestamps: true, collection: 'partner_patient_intakes' })
export class PartnerPatientIntake {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop() timezone?: string;

  @Prop() emergencyName?: string;

  @Prop() emergencyPhone?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  scannedByMemberId?: Types.ObjectId;

  @Prop() scannedByName?: string;

  @Prop({ required: true }) scannedAt: Date;
}

export type PartnerPatientIntakeDocument =
  HydratedDocument<PartnerPatientIntake>;
export const PartnerPatientIntakeSchema =
  SchemaFactory.createForClass(PartnerPatientIntake);
PartnerPatientIntakeSchema.index(
  { providerId: 1, patientId: 1 },
  { unique: true },
);
