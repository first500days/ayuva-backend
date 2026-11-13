import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { openIntake } from '../../core/profile/intake-qr';
import { intakeSecret } from '../../core/profile/intake-secret';
import {
  AccessLog,
  AccessLogDocument,
} from '../../core/sharing/schemas/access-log.schema';
import {
  User,
  UserDocument,
  UserRole,
} from '../../core/users/schemas/user.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  PartnerPatientIntake,
  PartnerPatientIntakeDocument,
} from './schemas/patient-intake.schema';

const REASON_TEXT: Record<string, string> = {
  malformed: 'That isn’t an AYUVA registration code.',
  tampered:
    'This code couldn’t be verified. Ask the patient to open a fresh one in the app.',
  expired:
    'This code has expired (they last 10 minutes). Ask the patient to open a fresh one.',
};

/**
 * Registration by profile QR: the desk scans the code the patient shows in
 * the app, the server opens it, and the patient joins this organisation's
 * patient list with the basics on the code pre-filled. The patient sees the
 * registration in their own access history; the action is audited.
 */
@Injectable()
export class PartnerIntakeService {
  constructor(
    @InjectModel(PartnerPatientIntake.name)
    private readonly intakeModel: Model<PartnerPatientIntakeDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(AccessLog.name)
    private readonly accessLogModel: Model<AccessLogDocument>,
    private readonly audit: AuditLogService,
  ) {}

  async scan(actor: PartnerActor, code: string) {
    const opened = openIntake(code, intakeSecret());
    if (!opened.ok) throw new BadRequestException(REASON_TEXT[opened.reason]);
    const p = opened.payload;
    if (!Types.ObjectId.isValid(p.uid))
      throw new BadRequestException(REASON_TEXT.malformed);
    const patient = await this.userModel
      .findOne({ _id: p.uid, role: UserRole.PATIENT })
      .select('fullName')
      .lean()
      .exec();
    if (!patient)
      throw new NotFoundException('This patient account no longer exists');

    const now = new Date();
    await this.intakeModel
      .updateOne(
        { providerId: actor.provider._id, patientId: patient._id },
        {
          $set: {
            timezone: p.tz ?? undefined,
            emergencyName: p.ec?.name || undefined,
            emergencyPhone: p.ec?.phone || undefined,
            scannedByMemberId: actor.member._id,
            scannedByName: actor.member.fullName,
            scannedAt: now,
          },
        },
        { upsert: true },
      )
      .exec();
    // The patient sees who registered them, in their Sharing & access history.
    await this.accessLogModel.create({
      userId: patient._id,
      grantId: 'intake-qr',
      organisationName: actor.provider.name,
      recordTitle:
        'your registration details (name, time zone, emergency contact)',
      action: 'granted',
      viewerUserId: actor.member.userId,
      viewerName: actor.member.fullName,
    });
    await this.audit.record({
      actorId: actor.member.userId.toString(),
      action: AuditAction.PARTNER_PATIENT_INTAKE,
      targetType: 'User',
      targetId: patient._id.toString(),
      metadata: {
        providerId: actor.provider._id.toString(),
        via: 'profile_qr',
      },
    });
    return {
      patientId: patient._id.toString(),
      fullName: p.name || patient.fullName,
      timezone: p.tz,
      emergencyContact: p.ec,
      registeredAt: now.toISOString(),
    };
  }

  /** Patients registered at this organisation by QR (for the patient list and access checks). */
  async linkedPatientIds(
    providerId: Types.ObjectId,
    patientId?: Types.ObjectId,
  ) {
    const rows = await this.intakeModel
      .find({ providerId, ...(patientId && { patientId }) })
      .select('patientId')
      .lean()
      .exec();
    return rows.map((r) => r.patientId);
  }
}
