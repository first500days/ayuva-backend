import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../../core/providers/schemas/appointment-slot.schema';
import {
  ShareGrant,
  ShareGrantDocument,
} from '../../core/sharing/schemas/share-grant.schema';
import {
  ShareOrganisation,
  ShareOrganisationDocument,
} from '../../core/sharing/schemas/share-organisation.schema';
import { describeScope } from '../../core/sharing/share-scope';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  Referral,
  ReferralDocument,
} from '../referrals/schemas/referral.schema';
import {
  LabOrderDocument,
  PartnerLabOrder,
} from '../lab/schemas/lab-order.schema';
import {
  AdmissionDocument,
  AdmissionStatus,
  PartnerAdmission,
} from '../hospital/schemas/admission.schema';
import {
  ConsultationNote,
  ConsultationNoteDocument,
} from './schemas/consultation-note.schema';
import {
  Prescription,
  PrescriptionDocument,
} from './schemas/prescription.schema';

export type PatientLinkSource =
  'appointment' | 'shared_records' | 'referral' | 'lab_order' | 'admission';

const LIVE_APPOINTMENT = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.REQUESTED,
];

/**
 * The organisation's patient list. A patient is visible only when there is a
 * real care relationship — a booking, an active share, a referral, a lab
 * order or an admission — never by searching the platform's user base.
 */
@Injectable()
export class PartnerPatientsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(ShareGrant.name)
    private readonly grantModel: Model<ShareGrantDocument>,
    @InjectModel(ShareOrganisation.name)
    private readonly orgModel: Model<ShareOrganisationDocument>,
    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,
    @InjectModel(PartnerLabOrder.name)
    private readonly labOrderModel: Model<LabOrderDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    @InjectModel(ConsultationNote.name)
    private readonly noteModel: Model<ConsultationNoteDocument>,
    @InjectModel(Prescription.name)
    private readonly rxModel: Model<PrescriptionDocument>,
  ) {}

  /** Throws 404 (not 403) for an unlinked patient, so the API never confirms someone exists. */
  async assertLinked(
    actor: PartnerActor,
    patientId: string,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(patientId))
      throw new NotFoundException('Patient not found');
    const pid = new Types.ObjectId(patientId);
    const providerId = actor.provider._id;
    const linked =
      (await this.appointmentModel.exists({ providerId, patientId: pid })) ||
      (await this.activeGrants(providerId, pid)).length > 0 ||
      (await this.referralModel.exists({
        patientId: pid,
        $or: [{ fromProviderId: providerId }, { toProviderId: providerId }],
      })) ||
      (await this.labOrderModel.exists({ providerId, patientId: pid })) ||
      (await this.admissionModel.exists({ providerId, patientId: pid }));
    const patient = linked
      ? await this.userModel.findById(pid).select('fullName').exec()
      : null;
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  /** Active, unexpired grants from this patient (or all patients) to the organisation. */
  async activeGrants(
    providerId: Types.ObjectId,
    patientId?: Types.ObjectId,
  ): Promise<ShareGrantDocument[]> {
    const orgs = await this.orgModel
      .find({ providerId })
      .select('_id')
      .lean()
      .exec();
    if (!orgs.length) return [];
    return this.grantModel
      .find({
        organisationId: { $in: orgs.map((o) => o._id.toString()) },
        status: 'active',
        ...(patientId && { userId: patientId }),
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      })
      .sort({ grantedAt: -1 })
      .exec();
  }

  async list(actor: PartnerActor, q: { q?: string; mine?: boolean }) {
    const providerId = actor.provider._id;
    const sources = new Map<string, Set<PatientLinkSource>>();
    const add = (
      id: Types.ObjectId | undefined | null,
      s: PatientLinkSource,
    ) => {
      if (!id) return;
      const key = id.toString();
      if (!sources.has(key)) sources.set(key, new Set());
      sources.get(key)!.add(s);
    };

    const memberId = actor.member._id;
    const [appointments, grants, referrals, orders, admissions] =
      await Promise.all([
        this.appointmentModel
          .find({ providerId, ...(q.mine && { assignedMemberId: memberId }) })
          .select('patientId slotId status assignedMemberId')
          .lean()
          .exec(),
        q.mine
          ? Promise.resolve([] as ShareGrantDocument[])
          : this.activeGrants(providerId),
        this.referralModel
          .find({
            $or: [{ fromProviderId: providerId }, { toProviderId: providerId }],
            ...(q.mine && { fromMemberId: memberId }),
          })
          .select('patientId')
          .lean()
          .exec(),
        q.mine
          ? Promise.resolve([])
          : this.labOrderModel
              .find({ providerId })
              .select('patientId')
              .lean()
              .exec(),
        this.admissionModel
          .find({
            providerId,
            patientId: { $exists: true },
            ...(q.mine && { attendingMemberId: memberId }),
          })
          .select('patientId status')
          .lean()
          .exec(),
      ]);
    if (q.mine) {
      // Also patients this clinician has written notes or prescriptions for.
      const [notes, rxs] = await Promise.all([
        this.noteModel
          .find({ providerId, authorMemberId: memberId })
          .select('patientId')
          .lean()
          .exec(),
        this.rxModel
          .find({ providerId, authorMemberId: memberId })
          .select('patientId')
          .lean()
          .exec(),
      ]);
      [...notes, ...rxs].forEach((d) => add(d.patientId, 'appointment'));
    }
    appointments.forEach((a) => add(a.patientId, 'appointment'));
    grants.forEach((g) => add(g.userId, 'shared_records'));
    referrals.forEach((r) => add(r.patientId, 'referral'));
    orders.forEach((o) => add(o.patientId, 'lab_order'));
    admissions.forEach((a) => add(a.patientId, 'admission'));

    const ids = [...sources.keys()].map((id) => new Types.ObjectId(id));
    const nameFilter = q.q?.trim()
      ? { fullName: buildSafeRegex(q.q.trim()) }
      : {};
    const users = await this.userModel
      .find({ _id: { $in: ids }, ...nameFilter })
      .select('fullName')
      .limit(500)
      .lean()
      .exec();

    const slots = await this.slotModel
      .find({ _id: { $in: appointments.map((a) => a.slotId) } })
      .select('date time')
      .lean()
      .exec();
    const slotById = new Map(slots.map((s) => [s._id.toString(), s]));
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const byPatient = new Map<
      string,
      { last?: Date; next?: Date; count: number }
    >();
    for (const a of appointments) {
      const key = a.patientId.toString();
      const e = byPatient.get(key) ?? { count: 0 };
      e.count += 1;
      const s = slotById.get(a.slotId.toString());
      if (s) {
        if (
          a.status === AppointmentStatus.COMPLETED &&
          (!e.last || s.date > e.last)
        )
          e.last = s.date;
        if (
          LIVE_APPOINTMENT.includes(a.status) &&
          s.date >= today &&
          (!e.next || s.date < e.next)
        )
          e.next = s.date;
      }
      byPatient.set(key, e);
    }
    const grantByPatient = new Map<string, ShareGrantDocument>();
    grants.forEach((g) => {
      if (!grantByPatient.has(g.userId.toString()))
        grantByPatient.set(g.userId.toString(), g);
    });
    const admittedNow = new Set(
      admissions
        .filter((a) => a.status === AdmissionStatus.ADMITTED)
        .map((a) => a.patientId!.toString()),
    );

    return users
      .map((u) => {
        const id = u._id.toString();
        const stats = byPatient.get(id);
        const grant = grantByPatient.get(id);
        return {
          id,
          name: u.fullName,
          sources: [...(sources.get(id) ?? [])],
          appointmentCount: stats?.count ?? 0,
          lastVisit: stats?.last?.toISOString().slice(0, 10) ?? null,
          nextVisit: stats?.next?.toISOString().slice(0, 10) ?? null,
          activeShare: grant
            ? {
                scopeLabel: describeScope(grant),
                expiresAt: grant.expiresAt?.toISOString() ?? null,
              }
            : null,
          admitted: admittedNow.has(id),
        };
      })
      .sort(
        (a, b) =>
          (b.nextVisit ?? b.lastVisit ?? '').localeCompare(
            a.nextVisit ?? a.lastVisit ?? '',
          ) || a.name.localeCompare(b.name),
      );
  }

  /** Header card for one patient: link sources and active shares (no record contents). */
  async summary(actor: PartnerActor, patientId: string) {
    const patient = await this.assertLinked(actor, patientId);
    const pid = patient._id;
    const grants = await this.activeGrants(actor.provider._id, pid);
    const [appointments, admitted] = await Promise.all([
      this.appointmentModel.countDocuments({
        providerId: actor.provider._id,
        patientId: pid,
      }),
      this.admissionModel.exists({
        providerId: actor.provider._id,
        patientId: pid,
        status: AdmissionStatus.ADMITTED,
      }),
    ]);
    return {
      id: patient.id,
      name: patient.fullName,
      appointmentCount: appointments,
      admitted: !!admitted,
      activeShares: grants.map((g) => ({
        grantId: g.id,
        scopeLabel: describeScope(g),
        purpose: g.purpose,
        duration: g.duration,
        grantedAt: (g.grantedAt ?? new Date()).toISOString(),
        expiresAt: g.expiresAt?.toISOString() ?? null,
      })),
    };
  }
}
