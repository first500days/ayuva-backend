import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum PrescriptionStatus {
  DRAFT = 'draft',
  SIGNED = 'signed',
  CANCELLED = 'cancelled',
}

/** One medicine line, entered by the doctor (no AI medicine recommendation — PRD legal boundary). */
@Schema({ _id: false })
export class RxItem {
  @Prop({ required: true, trim: true }) medicine: string;
  @Prop({ trim: true }) form?: string;
  @Prop({ trim: true }) strength?: string;
  @Prop({ trim: true }) dose?: string;
  @Prop({ required: true, trim: true }) frequency: string;
  @Prop({ required: true, trim: true }) duration: string;
  @Prop({ trim: true }) route?: string;
  @Prop({ trim: true }) instructions?: string;
  @Prop({ trim: true }) quantity?: string;
}
export const RxItemSchema = SchemaFactory.createForClass(RxItem);

@Schema({ _id: false })
export class RxPharmacy {
  @Prop({ trim: true }) name?: string;
  @Prop({ trim: true, lowercase: true }) email?: string;
}
export const RxPharmacySchema = SchemaFactory.createForClass(RxPharmacy);

export type PrescriptionDocument = HydratedDocument<Prescription>;

/**
 * Digital prescription (E-Rx). Drafts are editable; signing freezes the
 * content, stamps a content hash and delivers a PDF to the patient's Medical
 * Vault (and optionally a pharmacy). Corrections are made by cancelling and
 * re-issuing, never by editing a signed prescription.
 */
@Schema({ timestamps: true, collection: 'partner_prescriptions' })
export class Prescription {
  @Prop({ index: true, sparse: true, unique: true })
  rxNumber?: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  @Prop({ required: true })
  providerName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember', required: true })
  authorMemberId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true })
  authorUserId: Types.ObjectId;

  @Prop({ required: true })
  doctorName: string;

  @Prop()
  doctorRegistrationNumber?: string;

  @Prop()
  doctorTitle?: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  @Prop({ required: true })
  patientName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Appointment' })
  appointmentId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ConsultationNote' })
  noteId?: Types.ObjectId;

  @Prop({ type: [RxItemSchema], default: [] })
  items: RxItem[];

  // Doctor-entered clinical context printed on the slip.
  @Prop({ default: '' })
  diagnosis: string;

  @Prop({ default: '' })
  advice: string;

  @Prop({ type: [String], default: [] })
  investigations: string[];

  @Prop()
  followUpDate?: Date;

  @Prop({
    type: String,
    enum: PrescriptionStatus,
    default: PrescriptionStatus.DRAFT,
    index: true,
  })
  status: PrescriptionStatus;

  @Prop()
  signedAt?: Date;

  // sha256 over the signed content + signer + time: proves the slip wasn't altered after signing.
  @Prop()
  signatureHash?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MedicalRecord' })
  vaultRecordId?: Types.ObjectId;

  @Prop()
  deliveredToVaultAt?: Date;

  @Prop({ type: RxPharmacySchema })
  pharmacy?: RxPharmacy;

  @Prop()
  pharmacySentAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancelReason?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PrescriptionSchema = SchemaFactory.createForClass(Prescription);
PrescriptionSchema.index({ providerId: 1, patientId: 1, createdAt: -1 });
