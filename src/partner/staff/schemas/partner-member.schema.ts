import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { WorkingDay } from '../../../core/providers/schemas/provider.schema';
import { StaffRole } from '../../rbac/partner-permissions';

export enum MemberStatus {
  INVITED = 'invited',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

/** One weekly duty block on the staff roster, e.g. Mon 09:00–17:00. */
@Schema({ _id: false })
export class DutyBlock {
  @Prop({ type: String, enum: WorkingDay, required: true })
  day: WorkingDay;

  @Prop({ required: true })
  start: string; // HH:mm

  @Prop({ required: true })
  end: string; // HH:mm
}
export const DutyBlockSchema = SchemaFactory.createForClass(DutyBlock);

export type PartnerMemberDocument = HydratedDocument<PartnerMember>;

/**
 * A person working inside a partner organisation (Provider). The partner who
 * registered the organisation is its owner; everyone else is invited by an
 * organisation admin. Each login belongs to exactly one organisation.
 */
@Schema({ timestamps: true, collection: 'partner_members' })
export class PartnerMember {
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
    unique: true,
  })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: StaffRole, required: true })
  role: StaffRole;

  // The registering partner. Cannot be demoted, suspended or removed.
  @Prop({ default: false })
  isOwner: boolean;

  @Prop({
    type: String,
    enum: MemberStatus,
    default: MemberStatus.INVITED,
    index: true,
  })
  status: MemberStatus;

  // Denormalised from User for roster/listing screens.
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ trim: true })
  phone?: string;

  // e.g. "Consultant Cardiologist", "Senior Lab Technician".
  @Prop({ trim: true })
  title?: string;

  @Prop({ trim: true })
  department?: string;

  // Medical council registration — printed on prescriptions this member signs.
  @Prop({ trim: true })
  registrationNumber?: string;

  @Prop({ type: [DutyBlockSchema], default: [] })
  dutySchedule: DutyBlock[];

  // sha256 of the one-time invite token; the raw token only ever lives in the invite link.
  @Prop({ index: true, sparse: true })
  inviteTokenHash?: string;

  @Prop()
  inviteExpiresAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  invitedBy?: Types.ObjectId;

  @Prop()
  joinedAt?: Date;

  @Prop()
  lastActiveAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PartnerMemberSchema = SchemaFactory.createForClass(PartnerMember);
PartnerMemberSchema.index({ providerId: 1, status: 1, role: 1 });
