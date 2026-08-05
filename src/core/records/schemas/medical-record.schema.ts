import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import { Appointment } from '../../appointments/schemas/appointment.schema';

export enum MedicalRecordType {
  BLOOD = 'blood',
  IMAGING = 'imaging',
  PRESCRIPTION = 'prescription',
  DISCHARGE = 'discharge',
}

export type MedicalRecordDocument = HydratedDocument<MedicalRecord>;

@Schema({ timestamps: { createdAt: 'uploadedAt', updatedAt: true } })
export class MedicalRecord {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  patientId: Types.ObjectId;

  // Encrypted object storage key/URL (NFR-1) — never a raw public URL.
  @Prop({ required: true })
  fileRef: string;

  // Original upload filename — the closest thing to a "title" for FR-8.4's listing,
  // since TRD's MedicalRecord entity has no dedicated title field.
  @Prop({ required: true })
  originalFileName: string;

  @Prop({ type: String, enum: MedicalRecordType, required: true, index: true })
  type: MedicalRecordType;

  // Links this record/its interpretation to an upcoming booked appointment (PRD FR-9.5, TRD §4.4).
  @Prop({ type: SchemaTypes.ObjectId, ref: Appointment.name })
  attachedAppointmentId?: Types.ObjectId;

  uploadedAt?: Date;
}

export const MedicalRecordSchema = SchemaFactory.createForClass(MedicalRecord);
