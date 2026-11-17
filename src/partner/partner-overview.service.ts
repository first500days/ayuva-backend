import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
} from '../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../core/providers/schemas/appointment-slot.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
} from '../core/payments/schemas/transaction.schema';
import {
  AdmissionDocument,
  PartnerAdmission,
} from './hospital/schemas/admission.schema';
import { dateStart } from './hospital/clock';
import { PartnerActor } from './rbac/partner-perm.guard';
import { OrgType, Perm } from './rbac/partner-permissions';
import {
  BOOKED_STATUSES,
  OverviewMetric,
  OverviewRange,
  bucketOverview,
  localDate,
  nextDay,
  overviewDays,
} from './dashboard-overview';

/** The Partner dashboard's day-by-day chart (appointments, admissions, revenue). */
@Injectable()
export class PartnerOverviewService {
  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Transaction.name)
    private readonly txModel: Model<TransactionDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
  ) {}

  /**
   * Only the measures the member's role already sees elsewhere: appointments
   * with appointments.view, admissions with wards.view (hospitals), revenue
   * with billing.view — the same online payments as "Revenue this month".
   */
  async overview(actor: PartnerActor, range: OverviewRange, now = new Date()) {
    const can = (p: Perm) => actor.permissions.includes(p);
    const metrics: OverviewMetric[] = [];
    if (can(Perm.APPOINTMENTS_VIEW)) metrics.push('appointments');
    if (actor.orgType === OrgType.HOSPITAL && can(Perm.WARDS_VIEW))
      metrics.push('admissions');
    if (can(Perm.BILLING_VIEW)) metrics.push('revenue');

    const { days, today } = overviewDays(range, now);
    const first = days[0];
    const last = days[days.length - 1];
    const providerId = actor.provider._id;
    // Admissions and payments are instants, read by the providers' local day.
    const from = dateStart(first);
    const to = dateStart(nextDay(last));

    const [appointmentDates, admissionDates, payments] = await Promise.all([
      metrics.includes('appointments')
        ? this.appointmentDates(providerId, first, last)
        : Promise.resolve([] as string[]),
      metrics.includes('admissions')
        ? this.admissionModel
            .find({ providerId, admittedAt: { $gte: from, $lt: to } })
            .select('admittedAt')
            .lean()
            .exec()
            .then((rows) => rows.map((r) => localDate(r.admittedAt)))
        : Promise.resolve([] as string[]),
      metrics.includes('revenue')
        ? this.txModel
            .find({
              providerId,
              status: TransactionStatus.SUCCESSFUL,
              paidAt: { $gte: from, $lt: to },
            })
            .select('paidAt amount')
            .lean()
            .exec()
            .then((rows) =>
              rows.flatMap((r) =>
                r.paidAt
                  ? [{ date: localDate(r.paidAt), amount: r.amount }]
                  : [],
              ),
            )
        : Promise.resolve([] as { date: string; amount: number }[]),
    ]);

    const chart = bucketOverview({
      days,
      today,
      metrics,
      appointmentDates,
      admissionDates,
      payments,
    });
    return {
      range,
      from: first,
      to: last,
      today,
      metrics,
      days: chart.days,
      totals: chart.totals,
    };
  }

  /** The calendar day of every booked appointment whose slot falls in the period. */
  private async appointmentDates(
    providerId: Types.ObjectId,
    first: string,
    last: string,
  ): Promise<string[]> {
    // Slots are stored at UTC midnight of their calendar day.
    const slots = await this.slotModel
      .find({
        providerId,
        date: {
          $gte: new Date(`${first}T00:00:00.000Z`),
          $lt: new Date(`${nextDay(last)}T00:00:00.000Z`),
        },
      })
      .select('date')
      .lean()
      .exec();
    if (!slots.length) return [];
    const dayOfSlot = new Map(
      slots.map((s) => [s._id.toString(), s.date.toISOString().slice(0, 10)]),
    );
    const appointments = await this.appointmentModel
      .find({
        providerId,
        slotId: { $in: slots.map((s) => s._id) },
        status: { $in: BOOKED_STATUSES },
      })
      .select('slotId')
      .lean()
      .exec();
    return appointments.flatMap((a) => {
      const day = dayOfSlot.get(a.slotId.toString());
      return day ? [day] : [];
    });
  }
}
