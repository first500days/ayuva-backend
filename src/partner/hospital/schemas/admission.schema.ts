import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum AdmissionStatus {
  ADMITTED = 'admitted',
  DISCHARGED = 'discharged',
}

@Schema({ _id: false })
export class AdmissionTransfer {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) fromWardName: string;
  @Prop({ required: true }) fromBedLabel: string;
  @Prop({ required: true }) toWardName: string;
  @Prop({ required: true }) toBedLabel: string;
  @Prop() fromDepartment?: string;
  @Prop() toDepartment?: string;
  @Prop() reason?: string;
  @Prop() byName?: string;
}
export const AdmissionTransferSchema =
  SchemaFactory.createForClass(AdmissionTransfer);

export type AdmissionDocument = HydratedDocument<PartnerAdmission>;

/** An inpatient stay: admission → bed/department transfers → discharge. */
@Schema({ timestamps: true, collection: 'partner_admissions' })
export class PartnerAdmission {
  @Prop({ required: true, unique: true })
  admissionNo: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;

  // Set when the patient has an Ayuva account linked to this hospital; walk-ins have a name only.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', index: true, sparse: true })
  patientId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  patientName: string;

  @Prop({ trim: true }) patientPhone?: string;
  @Prop() age?: number;
  @Prop() gender?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Ward', required: true })
  wardId: Types.ObjectId;

  @Prop({ required: true })
  wardName: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  bedId: Types.ObjectId;

  @Prop({ required: true })
  bedLabel: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  attendingMemberId?: Types.ObjectId;

  @Prop()
  attendingName?: string;

  @Prop({ default: '' })
  reason: string;

  @Prop({ required: true })
  admittedAt: Date;

  @Prop()
  expectedDischargeAt?: Date;

  @Prop({
    type: String,
    enum: AdmissionStatus,
    default: AdmissionStatus.ADMITTED,
    index: true,
  })
  status: AdmissionStatus;

  @Prop()
  dischargedAt?: Date;

  // 'routine' | 'lama' | 'referred' | 'deceased'
  @Prop()
  dischargeType?: string;

  @Prop({ default: '' })
  dischargeNote: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MedicalRecord' })
  vaultRecordId?: Types.ObjectId;

  @Prop({ type: [AdmissionTransferSchema], default: [] })
  transfers: AdmissionTransfer[];

  @Prop() admittedByName?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PartnerAdmissionSchema =
  SchemaFactory.createForClass(PartnerAdmission);
PartnerAdmissionSchema.index({ providerId: 1, status: 1, admittedAt: -1 });
