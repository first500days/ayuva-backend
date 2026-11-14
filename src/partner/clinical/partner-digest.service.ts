import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../../core/appointments/schemas/appointment.schema';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../../core/health-profile/schemas/health-profile.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
  recordTitle,
} from '../../core/records/schemas/medical-record.schema';
import { grantRecordFilter } from '../../core/sharing/share-scope';
import {
  AccessLog,
  AccessLogDocument,
} from '../../core/sharing/schemas/access-log.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { patientAge } from '../../common/utils/age.util';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../../core/providers/schemas/appointment-slot.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerLabValuesService } from './partner-lab-values.service';
import { PartnerPatientsService } from './partner-patients.service';
import { PartnerPreVisitService } from './partner-pre-visit.service';

const MAX_DOCS = 20;
const MAX_LABS = 8;

/**
 * The Executive Digest for a cleared booking: one structured view of what the
 * patient has approved for this clinic (their pre-visit notes if they sent
 * them, the documents they shared, and the latest shared lab values) so the
 * clinician doesn't hunt through files. It compiles and labels; it suggests
 * nothing clinical. Opening it is logged once in the patient's access history.
 */
@Injectable()
export class PartnerDigestService {
  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(HealthProfile.name)
    private readonly profileModel: Model<HealthProfileDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    @InjectModel(AccessLog.name)
    private readonly logModel: Model<AccessLogDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly labValues: PartnerLabValuesService,
    private readonly preVisit: PartnerPreVisitService,
    private readonly audit: AuditLogService,
  ) {}

  async forAppointment(actor: PartnerActor, appointmentId: string) {
    if (!Types.ObjectId.isValid(appointmentId))
      throw new NotFoundException('Appointment not found');
    const appt = await this.appointmentModel
      .findOne({ _id: appointmentId, providerId: actor.provider._id })
      .lean()
      .exec();
    if (!appt) throw new NotFoundException('Appointment not found');
    // "Upon booking clearance": only once the clinic has confirmed it.
    if (
      ![AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED].includes(
        appt.status,
      )
    )
      return {
        appointmentId,
        ready: false as const,
        reason: 'Accept the booking to see the digest.',
      };

    const pid = appt.patientId;
    const [user, profile, slot, grants, labs, bundle] = await Promise.all([
      this.userModel.findById(pid).select('fullName').lean().exec(),
      this.profileModel
        .findOne({ userId: pid })
        .select('age dateOfBirth gender')
        .lean()
        .exec(),
      this.slotModel.findById(appt.slotId).select('date time').lean().exec(),
      this.patients.activeGrants(actor.provider._id, pid),
      this.labValues.forPatient(actor, pid).catch(() => []),
      this.preVisit.forAppointment(actor, appointmentId),
    ]);

    const docs = grants.length
      ? await this.recordModel
          .find({ $or: grants.map((g) => grantRecordFilter(g)) })
          .select('type procedureType kind providerName recordDate uploadedAt')
          .sort({ recordDate: -1, uploadedAt: -1 })
          .limit(MAX_DOCS)
          .exec()
      : [];

    // Latest value per test, above-range ones first.
    const latest = new Map<string, (typeof labs)[number]>();
    for (const p of labs) {
      const prev = latest.get(p.parameter);
      if (!prev || p.at > prev.at) latest.set(p.parameter, p);
    }
    const labRows = [...latest.values()]
      .map((p) => ({
        test: p.parameter,
        value: p.value,
        unit: p.unit,
        at: p.at,
        aboveRange: p.refHigh != null && p.value > p.refHigh,
      }))
      .sort(
        (a, b) =>
          Number(b.aboveRange) - Number(a.aboveRange) ||
          b.at.localeCompare(a.at),
      )
      .slice(0, MAX_LABS);

    await this.logModel.create({
      userId: pid,
      grantId: `digest:${appointmentId}`,
      organisationName: actor.provider.name,
      recordTitle: 'a summary of what you shared for your visit',
      action: 'viewed',
      viewerUserId: actor.member.userId,
      viewerName: actor.member.fullName,
    });
    await this.audit.record({
      actorId: actor.member.userId.toString(),
      action: AuditAction.PARTNER_RECORD_VIEW,
      targetType: 'Appointment',
      targetId: appointmentId,
      metadata: {
        kind: 'executive_digest',
        documents: docs.length,
        labs: labRows.length,
      },
    });

    const age = profile ? patientAge(profile).age : undefined;
    return {
      appointmentId,
      ready: true as const,
      patient: {
        id: pid.toString(),
        name: user?.fullName ?? 'Patient',
        age: age ?? null,
        gender: profile?.gender ?? null,
      },
      visit: {
        date: slot ? slot.date.toISOString().slice(0, 10) : null,
        time: slot?.time ?? null,
        status: appt.status,
      },
      preVisit: bundle.submitted ? bundle : null,
      sharedDocuments: docs.map((d) => ({
        id: d.id,
        title: recordTitle(d),
        type: d.type,
        from: d.providerName ?? null,
        date: (d.recordDate ?? d.uploadedAt)?.toISOString() ?? null,
      })),
      sharedGrants: grants.map((g) => g.id),
      labs: labRows,
      note: 'Compiled from what the patient approved for your organisation. A summary, not an assessment: open the documents for detail.',
    };
  }
}
