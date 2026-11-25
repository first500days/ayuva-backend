import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export enum TeleconsultStatus {
  WAITING = 'waiting', // the doctor opened the room, the patient hasn't joined
  LIVE = 'live',
  ENDED = 'ended',
}

/**
 * One video consultation: a two-person room between the doctor and the
 * patient. Audio and video go browser to browser (WebRTC); the server only
 * relays the connection setup and never records. The patient's consent is
 * recorded before the room opens (Telemedicine Practice Guidelines 2020).
 */
@Schema({ timestamps: true, collection: 'partner_teleconsults' })
export class Teleconsult {
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

  @Prop({ required: true }) patientName: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Appointment' })
  appointmentId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember', required: true })
  doctorMemberId: Types.ObjectId;

  @Prop({ required: true }) doctorName: string;

  @Prop({
    type: String,
    enum: TeleconsultStatus,
    default: TeleconsultStatus.WAITING,
  })
  status: TeleconsultStatus;

  // The patient agreed to a video consultation (recorded by the doctor).
  @Prop({ required: true }) consentAt: Date;
  @Prop() consentByName?: string;

  @Prop() patientJoinedAt?: Date;
  @Prop() endedAt?: Date;

  // The join links stop working after this.
  @Prop({ required: true }) expiresAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export type TeleconsultDocument = HydratedDocument<Teleconsult>;
export const TeleconsultSchema = SchemaFactory.createForClass(Teleconsult);
TeleconsultSchema.index({ providerId: 1, patientId: 1, createdAt: -1 });
