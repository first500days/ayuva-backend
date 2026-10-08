import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../../core/providers/schemas/appointment-slot.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
} from '../../core/records/schemas/medical-record.schema';
import {
  AccessLog,
  AccessLogDocument,
} from '../../core/sharing/schemas/access-log.schema';
import { grantRecordFilter } from '../../core/sharing/share-scope';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import {
  Referral,
  ReferralDocument,
} from '../referrals/schemas/referral.schema';
import {
  LabOrderDocument,
  PartnerLabOrder,
} from '../lab/schemas/lab-order.schema';
import { LabResult, LabResultDocument } from '../lab/schemas/lab-result.schema';
import {
  AdmissionDocument,
  PartnerAdmission,
} from '../hospital/schemas/admission.schema';
import {
  ConsultationNote,
  ConsultationNoteDocument,
  NoteStatus,
} from './schemas/consultation-note.schema';
import {
  Prescription,
  PrescriptionDocument,
  PrescriptionStatus,
} from './schemas/prescription.schema';
import { PartnerPatientsService } from './partner-patients.service';

export type TimelineKind =
  | 'appointment'
  | 'note'
  | 'prescription'
  | 'referral'
  | 'lab_order'
  | 'lab_result'
  | 'admission'
  | 'discharge'
  | 'record';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  detail: string;
  status?: string;
  source: 'organisation' | 'shared';
  link?: { type: string; id: string; grantId?: string };
}

export interface TrendSeries {
  parameter: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  points: { at: string; value: number; flag: string }[];
}

/**
 * Patient Health Timeline: one chronology of everything this organisation
 * did for the patient plus the vault records the patient chose to share,
 * with active medicines and lab trends. Opening it counts as a record
 * access, so it is written to the patient-visible access log and the
 * organisation's audit trail.
 */
@Injectable()
export class PartnerTimelineService {
  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    @InjectModel(AccessLog.name)
    private readonly accessModel: Model<AccessLogDocument>,
    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,
    @InjectModel(PartnerLabOrder.name)
    private readonly labOrderModel: Model<LabOrderDocument>,
    @InjectModel(LabResult.name)
    private readonly labResultModel: Model<LabResultDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    @InjectModel(ConsultationNote.name)
    private readonly noteModel: Model<ConsultationNoteDocument>,
    @InjectModel(Prescription.name)
    private readonly rxModel: Model<PrescriptionDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly audit: AuditLogService,
  ) {}

  async timeline(actor: PartnerActor, patientId: string) {
    const patient = await this.patients.assertLinked(actor, patientId);
    const pid = patient._id;
    const providerId = actor.provider._id;
    const canViewRecords = actor.permissions.includes(Perm.RECORDS_VIEW);
    const events: TimelineEvent[] = [];

    const [appointments, notes, rxs, referrals, orders, admissions] =
      await Promise.all([
        this.appointmentModel.find({ providerId, patientId: pid }).exec(),
        this.noteModel.find({ providerId, patientId: pid }).exec(),
        this.rxModel
          .find({
            providerId,
            patientId: pid,
            status: { $ne: PrescriptionStatus.DRAFT },
          })
          .exec(),
        this.referralModel
          .find({
            patientId: pid,
            $or: [{ fromProviderId: providerId }, { toProviderId: providerId }],
          })
          .exec(),
        this.labOrderModel.find({ providerId, patientId: pid }).exec(),
        this.admissionModel.find({ providerId, patientId: pid }).exec(),
      ]);

    const slots = await this.slotModel
      .find({ _id: { $in: appointments.map((a) => a.slotId) } })
      .exec();
    const slotById = new Map(slots.map((s) => [s.id, s]));
    for (const a of appointments) {
      const s = slotById.get(a.slotId.toString());
      const at = s
        ? new Date(
            `${s.date.toISOString().slice(0, 10)}T${s.time || '00:00'}:00.000Z`,
          )
        : (a.createdAt ?? new Date());
      events.push({
        id: `appt_${a.id}`,
        kind: 'appointment',
        at: at.toISOString(),
        title: a.followUpOfId ? 'Follow-up visit' : 'Appointment',
        detail: [a.department, a.assignedName ? `with ${a.assignedName}` : '']
          .filter(Boolean)
          .join(' · '),
        status: a.status,
        source: 'organisation',
        link: { type: 'appointment', id: a.id },
      });
    }
    for (const n of notes) {
      // Other clinicians' drafts are private until signed.
      const signed = n.status === NoteStatus.SIGNED;
      if (!signed && n.authorUserId.toString() !== actor.userId) continue;
      events.push({
        id: `note_${n.id}`,
        kind: 'note',
        at: (n.signedAt ?? n.createdAt ?? new Date()).toISOString(),
        title: signed ? 'Consultation note' : 'Consultation note (draft)',
        detail: [n.sections?.chiefComplaint, `by ${n.authorName}`]
          .filter(Boolean)
          .join(' — '),
        status: n.status,
        source: 'organisation',
        link: { type: 'note', id: n.id },
      });
    }
    for (const r of rxs) {
      events.push({
        id: `rx_${r.id}`,
        kind: 'prescription',
        at: (r.signedAt ?? r.createdAt ?? new Date()).toISOString(),
        title: `Prescription ${r.rxNumber ?? ''}`.trim(),
        detail: r.items.map((i) => i.medicine).join(', '),
        status: r.status,
        source: 'organisation',
        link: { type: 'prescription', id: r.id },
      });
    }
    for (const r of referrals) {
      const outgoing = r.fromProviderId.equals(providerId);
      events.push({
        id: `ref_${r.id}`,
        kind: 'referral',
        at: (r.createdAt ?? new Date()).toISOString(),
        title: outgoing
          ? `Referred to ${r.toName}`
          : `Referral from ${r.fromProviderName}`,
        detail: r.reason,
        status: r.status,
        source: 'organisation',
        link: { type: 'referral', id: r.id },
      });
    }
    for (const o of orders) {
      events.push({
        id: `lab_${o.id}`,
        kind: o.deliveredAt ? 'lab_result' : 'lab_order',
        at: (o.deliveredAt ?? o.createdAt ?? new Date()).toISOString(),
        title: o.deliveredAt
          ? `Lab report ${o.orderNo}`
          : `Lab order ${o.orderNo}`,
        detail: o.items.map((i) => i.name).join(', '),
        status: o.status,
        source: 'organisation',
        link: { type: 'lab_order', id: o.id },
      });
    }
    for (const a of admissions) {
      events.push({
        id: `adm_${a.id}`,
        kind: 'admission',
        at: a.admittedAt.toISOString(),
        title: `Admitted — ${a.wardName} / ${a.bedLabel}`,
        detail: [a.department, a.reason].filter(Boolean).join(' · '),
        status: a.status,
        source: 'organisation',
        link: { type: 'admission', id: a.id },
      });
      if (a.dischargedAt) {
        events.push({
          id: `dis_${a.id}`,
          kind: 'discharge',
          at: a.dischargedAt.toISOString(),
          title: 'Discharged',
          detail: a.dischargeNote
            ? a.dischargeNote.slice(0, 140)
            : (a.dischargeType ?? ''),
          status: a.dischargeType,
          source: 'organisation',
          link: { type: 'admission', id: a.id },
        });
      }
    }

    // Vault records the patient has shared, resolved live from every active grant.
    const grants = await this.patients.activeGrants(providerId, pid);
    const sharedRecordIds: Types.ObjectId[] = [];
    if (canViewRecords && grants.length) {
      const seen = new Set<string>();
      for (const g of grants) {
        const records = await this.recordModel
          .find(grantRecordFilter(g))
          .sort({ recordDate: -1 })
          .limit(300)
          .exec();
        for (const r of records) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          sharedRecordIds.push(r._id);
          events.push({
            id: `rec_${r.id}`,
            kind: 'record',
            at: (r.recordDate ?? r.uploadedAt ?? new Date()).toISOString(),
            title: r.originalFileName,
            detail: [r.type.replace('_', ' '), r.providerName]
              .filter(Boolean)
              .join(' · '),
            source: 'shared',
            link: { type: 'record', id: r.id, grantId: g.id },
          });
        }
        await this.accessModel.create({
          userId: pid,
          grantId: g.id,
          organisationName: g.organisationName,
          recordTitle: `Health timeline (${records.length} record${records.length === 1 ? '' : 's'})`,
          action: 'viewed',
          viewerUserId: new Types.ObjectId(actor.userId),
          viewerName: actor.member.fullName,
        });
      }
    }
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_PATIENT_VIEW,
      targetType: 'User',
      targetId: pid.toString(),
      metadata: {
        providerId: actor.provider.id,
        patientId: pid.toString(),
        label: 'Patient timeline',
        sharedRecords: sharedRecordIds.length,
      },
      ipAddress: actor.ip,
    });

    events.sort((a, b) => b.at.localeCompare(a.at));
    return {
      patient: { id: patient.id, name: patient.fullName },
      canViewRecords,
      activeShares: grants.length,
      events,
      medications: this.activeMedications(rxs),
      labTrends: await this.labTrends(providerId, pid, sharedRecordIds),
    };
  }

  /** Medicines from this organisation's signed prescriptions that are still within their duration. */
  private activeMedications(rxs: PrescriptionDocument[]) {
    const now = Date.now();
    const meds: {
      medicine: string;
      details: string;
      prescribedAt: string;
      until: string | null;
      prescriber: string;
      rxNumber: string | null;
      active: boolean;
    }[] = [];
    for (const rx of rxs) {
      if (rx.status !== PrescriptionStatus.SIGNED || !rx.signedAt) continue;
      for (const item of rx.items) {
        const days = durationDays(item.duration);
        const until =
          days !== null
            ? new Date(rx.signedAt.getTime() + days * 86_400_000)
            : null;
        meds.push({
          medicine: [item.form, item.medicine, item.strength]
            .filter(Boolean)
            .join(' '),
          details: [item.dose, item.frequency, item.duration, item.instructions]
            .filter(Boolean)
            .join(' · '),
          prescribedAt: rx.signedAt.toISOString(),
          until: until?.toISOString() ?? null,
          prescriber: rx.doctorName,
          rxNumber: rx.rxNumber ?? null,
          active: until
            ? until.getTime() >= now
            : now - rx.signedAt.getTime() < 30 * 86_400_000,
        });
      }
    }
    return meds.sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        b.prescribedAt.localeCompare(a.prescribedAt),
    );
  }

  /**
   * Numeric results over time: released reports from this organisation, plus
   * reports from any lab whose vault record the patient shared with us.
   */
  private async labTrends(
    providerId: Types.ObjectId,
    patientId: Types.ObjectId,
    sharedRecordIds: Types.ObjectId[],
  ): Promise<TrendSeries[]> {
    const results = await this.labResultModel
      .find({
        patientId,
        status: 'released',
        $or: [
          { providerId },
          ...(sharedRecordIds.length
            ? [{ recordId: { $in: sharedRecordIds } }]
            : []),
        ],
      })
      .sort({ releasedAt: 1 })
      .exec();
    const series = new Map<string, TrendSeries>();
    for (const r of results) {
      for (const t of r.tests) {
        for (const v of t.values) {
          const value = Number.parseFloat(v.value);
          if (!Number.isFinite(value)) continue;
          const key = `${v.name.toLowerCase()}|${(v.unit ?? '').toLowerCase()}`;
          const s = series.get(key) ?? {
            parameter: v.name,
            unit: v.unit ?? null,
            refLow: v.refLow ?? null,
            refHigh: v.refHigh ?? null,
            points: [],
          };
          s.points.push({
            at: (r.releasedAt ?? r.createdAt ?? new Date()).toISOString(),
            value,
            flag: v.flag,
          });
          series.set(key, s);
        }
      }
    }
    // Parameters measured more than once first — those are actual trends.
    return [...series.values()].sort(
      (a, b) =>
        b.points.length - a.points.length ||
        a.parameter.localeCompare(b.parameter),
    );
  }
}

/** "5 days" → 5, "2 weeks" → 14, "1 month" → 30; null when it can't tell. */
export function durationDays(duration: string): number | null {
  const m = duration?.match(
    /(\d+(?:\.\d+)?)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mth|mths|month|months)\b/i,
  );
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('d')) return n;
  if (unit.startsWith('w')) return n * 7;
  return n * 30;
}
