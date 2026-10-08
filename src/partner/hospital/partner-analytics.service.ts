import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotStatus,
} from '../../core/providers/schemas/appointment-slot.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
} from '../../core/payments/schemas/transaction.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { OrgType, roleLabel } from '../rbac/partner-permissions';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import {
  ConsultationNote,
  ConsultationNoteDocument,
} from '../clinical/schemas/consultation-note.schema';
import {
  Prescription,
  PrescriptionDocument,
} from '../clinical/schemas/prescription.schema';
import {
  Referral,
  ReferralDocument,
  ReferralStatus,
} from '../referrals/schemas/referral.schema';
import {
  LabOrderDocument,
  LabOrderStatus,
  PartnerLabOrder,
} from '../lab/schemas/lab-order.schema';
import {
  AdmissionDocument,
  PartnerAdmission,
} from './schemas/admission.schema';
import { PartnerClaimsService } from './partner-claims.service';

const DAY = 86_400_000;
const UPCOMING_DAYS = 7;
const BOOKED = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.REQUESTED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Department Utilization Analytics and the Billing & Claims dashboard. */
@Injectable()
export class PartnerAnalyticsService {
  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Transaction.name)
    private readonly txModel: Model<TransactionDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(ConsultationNote.name)
    private readonly noteModel: Model<ConsultationNoteDocument>,
    @InjectModel(Prescription.name)
    private readonly rxModel: Model<PrescriptionDocument>,
    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,
    @InjectModel(PartnerLabOrder.name)
    private readonly labOrderModel: Model<LabOrderDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    private readonly claims: PartnerClaimsService,
  ) {}

  async analytics(actor: PartnerActor, days = 30) {
    const providerId = actor.provider._id;
    const now = new Date();
    const since = startOfDay(new Date(now.getTime() - (days - 1) * DAY));
    const endOfToday = new Date(startOfDay(now).getTime() + DAY);
    // Load views (busy hours, departments, workload) also count visits already
    // booked for the coming week; revenue and utilisation stay historical.
    const until = new Date(endOfToday.getTime() + UPCOMING_DAYS * DAY);

    const slots = await this.slotModel
      .find({ providerId, date: { $gte: since, $lt: until } })
      .exec();
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const appointments = await this.appointmentModel
      .find({
        providerId,
        slotId: { $in: slots.map((s) => s._id) },
        status: { $in: BOOKED },
      })
      .exec();
    const members = await this.memberModel.find({ providerId }).exec();
    const memberById = new Map(members.map((m) => [m.id, m]));
    const departmentOf = (a: AppointmentDocument) =>
      a.department ||
      (a.assignedMemberId &&
        memberById.get(a.assignedMemberId.toString())?.department) ||
      'Unassigned';

    // Busy hours: weekday × hour heatmap of booked visits.
    const heat = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));
    for (const a of appointments) {
      const s = slotById.get(a.slotId.toString());
      if (!s) continue;
      const weekday = (s.date.getUTCDay() + 6) % 7;
      const hour = Number.parseInt(s.time?.slice(0, 2) ?? '', 10);
      if (Number.isFinite(hour) && hour >= 0 && hour < 24)
        heat[weekday][hour] += 1;
    }

    // Revenue by department, via the appointment each payment was for.
    const txs = await this.txModel
      .find({
        providerId,
        status: TransactionStatus.SUCCESSFUL,
        paidAt: { $gte: since, $lt: endOfToday },
      })
      .exec();
    const apptIds = txs
      .map((t) => t.appointmentId)
      .filter((id): id is Types.ObjectId => !!id);
    const paidAppts = await this.appointmentModel
      .find({ _id: { $in: apptIds } })
      .exec();
    const apptById = new Map(paidAppts.map((a) => [a.id, a]));

    const depts = new Map<
      string,
      {
        department: string;
        appointments: number;
        completed: number;
        revenue: number;
      }
    >();
    const dept = (name: string) => {
      if (!depts.has(name))
        depts.set(name, {
          department: name,
          appointments: 0,
          completed: 0,
          revenue: 0,
        });
      return depts.get(name)!;
    };
    for (const d of actor.provider.departments ?? []) dept(d);
    for (const a of appointments) {
      const d = dept(departmentOf(a));
      d.appointments += 1;
      if (a.status === AppointmentStatus.COMPLETED) d.completed += 1;
    }
    for (const t of txs) {
      const a = t.appointmentId
        ? apptById.get(t.appointmentId.toString())
        : undefined;
      dept(a ? departmentOf(a) : 'Other').revenue += t.amount;
    }

    // Staff workload over the window.
    const [notes, rxs, admissions] = await Promise.all([
      this.noteModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { providerId, status: 'signed', signedAt: { $gte: since } } },
        { $group: { _id: '$authorMemberId', n: { $sum: 1 } } },
      ]),
      this.rxModel.aggregate<{ _id: Types.ObjectId; n: number }>([
        {
          $match: {
            providerId,
            status: { $in: ['signed', 'cancelled'] },
            signedAt: { $gte: since },
          },
        },
        { $group: { _id: '$authorMemberId', n: { $sum: 1 } } },
      ]),
      actor.orgType === OrgType.HOSPITAL
        ? this.admissionModel.aggregate<{ _id: Types.ObjectId; n: number }>([
            {
              $match: {
                providerId,
                admittedAt: { $gte: since },
                attendingMemberId: { $exists: true },
              },
            },
            { $group: { _id: '$attendingMemberId', n: { $sum: 1 } } },
          ])
        : Promise.resolve([] as { _id: Types.ObjectId; n: number }[]),
    ]);
    const count = (rows: { _id: Types.ObjectId; n: number }[]) =>
      new Map(rows.map((r) => [r._id?.toString(), r.n]));
    const notesBy = count(notes);
    const rxBy = count(rxs);
    const admBy = count(admissions);
    const workload = members
      .filter((m) => m.status === MemberStatus.ACTIVE)
      .map((m) => {
        const assigned = appointments.filter(
          (a) => a.assignedMemberId?.toString() === m.id,
        );
        return {
          memberId: m.id,
          name: m.fullName,
          role: roleLabel(actor.orgType, m.role),
          department: m.department ?? null,
          appointments: assigned.length,
          completed: assigned.filter(
            (a) => a.status === AppointmentStatus.COMPLETED,
          ).length,
          notesSigned: notesBy.get(m.id) ?? 0,
          prescriptionsSigned: rxBy.get(m.id) ?? 0,
          admissions: admBy.get(m.id) ?? 0,
          dutyHoursPerWeek:
            Math.round(
              m.dutySchedule.reduce(
                (h, b) => h + minutes(b.end) / 60 - minutes(b.start) / 60,
                0,
              ) * 10,
            ) / 10,
        };
      })
      .filter(
        (w) =>
          w.appointments ||
          w.notesSigned ||
          w.prescriptionsSigned ||
          w.admissions ||
          w.dutyHoursPerWeek,
      )
      .sort(
        (a, b) =>
          b.appointments - a.appointments || b.notesSigned - a.notesSigned,
      );

    // Daily trend + slot utilisation (past days only).
    const trend = Array.from({ length: days }, (_, i) => {
      const d = new Date(since.getTime() + i * DAY);
      return {
        date: d.toISOString().slice(0, 10),
        appointments: 0,
        completed: 0,
        revenue: 0,
      };
    });
    const trendByDate = new Map(trend.map((t) => [t.date, t]));
    for (const a of appointments) {
      const s = slotById.get(a.slotId.toString());
      const t = s && trendByDate.get(s.date.toISOString().slice(0, 10));
      if (!t) continue;
      t.appointments += 1;
      if (a.status === AppointmentStatus.COMPLETED) t.completed += 1;
    }
    for (const tx of txs) {
      const t =
        tx.paidAt && trendByDate.get(tx.paidAt.toISOString().slice(0, 10));
      if (t) t.revenue += tx.amount;
    }
    const pastSlots = slots.filter(
      (s) =>
        s.date < startOfDay(now) && s.status !== AppointmentSlotStatus.BLOCKED,
    );
    const bookedPast = pastSlots.filter(
      (s) => s.status === AppointmentSlotStatus.BOOKED,
    ).length;

    const referrals = await this.referralModel
      .find({
        $or: [{ fromProviderId: providerId }, { toProviderId: providerId }],
        createdAt: { $gte: since },
      })
      .select('fromProviderId status')
      .lean()
      .exec();
    const refCounts = (out: boolean) => {
      const rows = referrals.filter(
        (r) => r.fromProviderId.equals(providerId) === out,
      );
      return {
        total: rows.length,
        accepted: rows.filter(
          (r) =>
            r.status === ReferralStatus.ACCEPTED ||
            r.status === ReferralStatus.COMPLETED,
        ).length,
        declined: rows.filter((r) => r.status === ReferralStatus.DECLINED)
          .length,
        pending: rows.filter((r) => r.status === ReferralStatus.SENT).length,
      };
    };

    let lab: unknown = null;
    if (actor.orgType === OrgType.DIAGNOSTIC) {
      const orders = await this.labOrderModel
        .find({ providerId, createdAt: { $gte: since } })
        .exec();
      const byCategory = new Map<
        string,
        { category: string; tests: number; revenue: number }
      >();
      for (const o of orders.filter(
        (x) => x.status !== LabOrderStatus.CANCELLED,
      )) {
        for (const i of o.items) {
          const e = byCategory.get(i.category) ?? {
            category: i.category,
            tests: 0,
            revenue: 0,
          };
          e.tests += 1;
          if (o.payment?.status === 'paid') e.revenue += i.price;
          byCategory.set(i.category, e);
        }
      }
      lab = {
        orders: orders.length,
        byCategory: [...byCategory.values()].sort((a, b) => b.tests - a.tests),
      };
    }

    const upcoming = appointments.filter((a) => {
      const s = slotById.get(a.slotId.toString());
      return !!s && s.date >= endOfToday;
    }).length;

    return {
      windowDays: days,
      upcomingDays: UPCOMING_DAYS,
      totals: {
        appointments: appointments.length - upcoming,
        upcoming,
        completed: appointments.filter(
          (a) => a.status === AppointmentStatus.COMPLETED,
        ).length,
        noShows: appointments.filter(
          (a) => a.status === AppointmentStatus.NO_SHOW,
        ).length,
        revenue: txs.reduce((s, t) => s + t.amount, 0),
        slotUtilisation: pastSlots.length
          ? Math.round((bookedPast / pastSlots.length) * 100)
          : null,
      },
      busyHours: { weekdays: WEEKDAYS, matrix: heat },
      departments: [...depts.values()].sort(
        (a, b) => b.appointments - a.appointments || b.revenue - a.revenue,
      ),
      workload,
      trend,
      referrals: { outgoing: refCounts(true), incoming: refCounts(false) },
      lab,
    };
  }

  async billing(actor: PartnerActor, days = 30) {
    const providerId = actor.provider._id;
    const now = new Date();
    const today = startOfDay(now);
    const weekStart = new Date(
      today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY,
    );
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const since = startOfDay(new Date(now.getTime() - (days - 1) * DAY));

    const [paid, all, settlement, recent] = await Promise.all([
      this.txModel
        .find({
          providerId,
          status: TransactionStatus.SUCCESSFUL,
          paidAt: { $gte: since < monthStart ? since : monthStart },
        })
        .exec(),
      this.txModel.aggregate<{ _id: string; total: number; n: number }>([
        { $match: { providerId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$status',
            total: { $sum: '$amount' },
            n: { $sum: 1 },
          },
        },
      ]),
      this.txModel.aggregate<{ _id: string; total: number }>([
        { $match: { providerId, status: TransactionStatus.SUCCESSFUL } },
        { $group: { _id: '$settlementStatus', total: { $sum: '$amount' } } },
      ]),
      this.txModel
        .find({ providerId })
        .sort({ createdAt: -1 })
        .limit(15)
        .exec(),
    ]);
    const sumSince = (d: Date) =>
      paid
        .filter((t) => t.paidAt && t.paidAt >= d)
        .reduce((s, t) => s + t.amount, 0);
    const byMethod = new Map<string, number>();
    for (const t of paid.filter((x) => x.paidAt && x.paidAt >= since)) {
      const m = t.paymentMethod || 'unspecified';
      byMethod.set(m, (byMethod.get(m) ?? 0) + t.amount);
    }
    const daily = Array.from({ length: days }, (_, i) => ({
      date: new Date(since.getTime() + i * DAY).toISOString().slice(0, 10),
      amount: 0,
    }));
    const dailyBy = new Map(daily.map((d) => [d.date, d]));
    for (const t of paid) {
      const d = t.paidAt && dailyBy.get(t.paidAt.toISOString().slice(0, 10));
      if (d) d.amount += t.amount;
    }
    const status = (s: TransactionStatus) =>
      all.find((a) => a._id === String(s));
    const patients = await this.userModel
      .find({ _id: { $in: recent.map((t) => t.patientId) } })
      .select('fullName')
      .lean()
      .exec();
    const nameById = new Map(
      patients.map((p) => [p._id.toString(), p.fullName]),
    );

    let lab: unknown = null;
    if (actor.orgType === OrgType.DIAGNOSTIC) {
      const orders = await this.labOrderModel
        .find({ providerId, createdAt: { $gte: since } })
        .select('total payment status')
        .lean()
        .exec();
      const live = orders.filter((o) => o.status !== LabOrderStatus.CANCELLED);
      lab = {
        billed: live.reduce((s, o) => s + (o.total ?? 0), 0),
        collected: live
          .filter((o) => o.payment?.status === 'paid')
          .reduce((s, o) => s + (o.total ?? 0), 0),
        outstanding: live
          .filter((o) => (o.payment?.status ?? 'unpaid') === 'unpaid')
          .reduce((s, o) => s + (o.total ?? 0), 0),
        unpaidOrders: live.filter(
          (o) => (o.payment?.status ?? 'unpaid') === 'unpaid',
        ).length,
      };
    }

    return {
      windowDays: days,
      consultationFee: actor.provider.consultationFee ?? null,
      revenue: {
        today: sumSince(today),
        week: sumSince(weekStart),
        month: sumSince(monthStart),
        window: sumSince(since),
      },
      pending: status(TransactionStatus.PENDING)?.total ?? 0,
      refunded:
        (status(TransactionStatus.REFUNDED)?.total ?? 0) +
        (status(TransactionStatus.PARTIALLY_REFUNDED)?.total ?? 0),
      failed: status(TransactionStatus.FAILED)?.n ?? 0,
      payouts: {
        settled: settlement.find((s) => s._id === 'settled')?.total ?? 0,
        awaiting: settlement
          .filter((s) => s._id !== 'settled')
          .reduce((a, s) => a + s.total, 0),
      },
      byMethod: [...byMethod.entries()]
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount),
      daily,
      recent: recent.map((t) => ({
        id: t.id,
        receiptNo: `AYV-${t.id.slice(-8).toUpperCase()}`,
        patientName: nameById.get(t.patientId.toString()) ?? 'Patient',
        amount: t.amount,
        currency: t.currency,
        method: t.paymentMethod ?? null,
        status: t.status,
        settlementStatus: t.settlementStatus,
        paidAt: t.paidAt?.toISOString() ?? null,
        createdAt: (t.createdAt ?? new Date()).toISOString(),
      })),
      lab,
      claims:
        actor.orgType === OrgType.HOSPITAL
          ? await this.claims.summary(providerId)
          : null,
    };
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
