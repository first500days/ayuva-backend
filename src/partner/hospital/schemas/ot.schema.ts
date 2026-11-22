import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type OtRoomDocument = HydratedDocument<OtRoom>;

/** An operation theatre. */
@Schema({ timestamps: true, collection: 'partner_ot_rooms' })
export class OtRoom {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;
  @Prop({ required: true, trim: true }) name: string;
  // general | orthopaedic | cardiac | neuro | obstetric | ophthalmic | minor
  @Prop({ default: 'general' }) type: string;
  @Prop({ default: true }) active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
export const OtRoomSchema = SchemaFactory.createForClass(OtRoom);
OtRoomSchema.index({ providerId: 1, name: 1 }, { unique: true });

export enum OtStatus {
  SCHEDULED = 'scheduled',
  PRE_OP = 'pre_op',
  IN_THEATRE = 'in_theatre',
  RECOVERY = 'recovery',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  POSTPONED = 'postponed',
}

export const ANAESTHESIA_TYPES = [
  'general',
  'spinal',
  'epidural',
  'regional',
  'local',
  'sedation',
] as const;
export const OT_PRIORITIES = ['elective', 'urgent', 'emergency'] as const;
export const OT_SIDES = ['na', 'left', 'right', 'bilateral'] as const;

@Schema({ _id: false })
export class OtPerson {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerMember' })
  memberId?: Types.ObjectId;
  @Prop({ required: true }) name: string;
}
export const OtPersonSchema = SchemaFactory.createForClass(OtPerson);

/** A checklist tick with who and when. */
@Schema({ _id: false })
export class OtTick {
  @Prop({ required: true }) at: Date;
  @Prop() byName?: string;
}
export const OtTickSchema = SchemaFactory.createForClass(OtTick);

/** Pre-operative readiness. */
@Schema({ _id: false })
export class OtPreOp {
  @Prop({ type: OtTickSchema }) consent?: OtTick;
  @Prop({ type: OtTickSchema }) siteMarked?: OtTick;
  @Prop({ type: OtTickSchema }) fasting?: OtTick;
  @Prop({ type: OtTickSchema }) anaesthesiaCheck?: OtTick;
  @Prop({ type: OtTickSchema }) bloodArranged?: OtTick;
  @Prop({ type: OtTickSchema }) investigations?: OtTick;
  @Prop({ type: OtTickSchema }) implantsReady?: OtTick;
  @Prop({ type: OtTickSchema }) antibiotic?: OtTick;
}
export const OtPreOpSchema = SchemaFactory.createForClass(OtPreOp);

/** WHO Surgical Safety Checklist: Sign In, Time Out, Sign Out. */
@Schema({ _id: false })
export class OtSafety {
  @Prop({ type: OtTickSchema }) signIn?: OtTick;
  @Prop({ type: OtTickSchema }) timeOut?: OtTick;
  @Prop({ type: OtTickSchema }) signOut?: OtTick;
}
export const OtSafetySchema = SchemaFactory.createForClass(OtSafety);

@Schema({ _id: false })
export class OtTimes {
  @Prop() wheeledIn?: Date;
  @Prop() anaesthesiaStart?: Date;
  @Prop() incision?: Date;
  @Prop() closure?: Date;
  @Prop() wheeledOut?: Date;
  @Prop() recoveryIn?: Date;
  @Prop() recoveryOut?: Date;
}
export const OtTimesSchema = SchemaFactory.createForClass(OtTimes);

@Schema({ _id: false })
export class OtPostOp {
  @Prop() procedureDone?: string;
  @Prop() findings?: string;
  @Prop() complications?: string;
  @Prop() bloodLossMl?: number;
  @Prop() implants?: string;
  @Prop() specimens?: string;
  // ward | icu | hdu | home | other
  @Prop() disposition?: string;
  @Prop() instructions?: string;
  @Prop() byName?: string;
  @Prop() at?: Date;
}
export const OtPostOpSchema = SchemaFactory.createForClass(OtPostOp);

@Schema({ _id: false })
export class OtStageEntry {
  @Prop({ required: true }) at: Date;
  @Prop({ required: true }) from: string;
  @Prop({ required: true }) to: string;
  @Prop() byName?: string;
  @Prop() note?: string;
}
export const OtStageEntrySchema = SchemaFactory.createForClass(OtStageEntry);

export type OtCaseDocument = HydratedDocument<OtCase>;

/** A surgical case booked into a theatre, from scheduling to recovery. */
@Schema({ timestamps: true, collection: 'partner_ot_cases' })
export class OtCase {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Provider',
    required: true,
    index: true,
  })
  providerId: Types.ObjectId;
  @Prop({ required: true }) caseNo: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'OtRoom', required: true })
  roomId: Types.ObjectId;
  @Prop({ required: true }) roomName: string;
  @Prop({ required: true }) start: Date;
  @Prop({ required: true }) end: Date;

  @Prop({ required: true, trim: true }) patientName: string;
  @Prop() age?: number;
  @Prop() gender?: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PartnerAdmission' })
  admissionId?: Types.ObjectId;
  @Prop() admissionNo?: string;

  @Prop({ required: true, trim: true }) procedure: string;
  @Prop({ type: String, enum: OT_SIDES, default: 'na' }) side: string;
  @Prop({ type: String, enum: OT_PRIORITIES, default: 'elective' })
  priority: string;
  @Prop({ trim: true }) department?: string;

  @Prop({ type: OtPersonSchema, required: true }) surgeon: OtPerson;
  @Prop({ type: [OtPersonSchema], default: [] }) assistants: OtPerson[];
  @Prop({ type: OtPersonSchema }) anaesthetist?: OtPerson;
  @Prop({ type: String, enum: ANAESTHESIA_TYPES, default: 'general' })
  anaesthesia: string;
  @Prop({ trim: true }) notes?: string;

  @Prop({
    type: String,
    enum: OtStatus,
    default: OtStatus.SCHEDULED,
    index: true,
  })
  status: OtStatus;

  @Prop({ type: OtPreOpSchema, default: () => ({}) }) preOp: OtPreOp;
  @Prop({ type: OtSafetySchema, default: () => ({}) }) safety: OtSafety;
  @Prop({ type: OtTimesSchema, default: () => ({}) }) times: OtTimes;
  @Prop({ type: OtPostOpSchema }) postOp?: OtPostOp;
  @Prop({ type: [OtStageEntrySchema], default: [] }) stageLog: OtStageEntry[];
  @Prop() cancelReason?: string;
  @Prop() bookedByName?: string;

  createdAt?: Date;
  updatedAt?: Date;
}
export const OtCaseSchema = SchemaFactory.createForClass(OtCase);
OtCaseSchema.index({ providerId: 1, caseNo: 1 }, { unique: true });
OtCaseSchema.index({ providerId: 1, start: 1 });
