import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { StaffRole } from '../rbac/partner-permissions';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import {
  Referral,
  ReferralDocument,
} from '../referrals/schemas/referral.schema';
import {
  LabOrderDocument,
  LabOrderStatus,
  PartnerLabOrder,
} from './schemas/lab-order.schema';
import { LabResult, LabResultDocument } from './schemas/lab-result.schema';
import { isCriticalFlag } from './lab-flags';
import type { ResultRow } from './result-changes';

/** Minutes a critical value may wait for a recorded call-out before lab management is alerted. */
export const ESCALATE_AFTER_MIN = Number(
  process.env.CRITICAL_ESCALATE_MINUTES ?? 15,
);
/** How long the board keeps showing a critical value. */
const BOARD_HOURS = 48;
/** The escalation sweep only looks this far back. */
const SWEEP_DAYS = 7;

export const describeCritical = (rows: ResultRow[]) =>
  rows
    .map(
      (r) =>
        `${r.name} ${r.value}${r.unit ? ` ${r.unit}` : ''} (${r.flag === 'critical_low' ? 'critically low' : 'critically high'})`,
    )
    .join(', ');

/**
 * Critical (panic) values after analysis: a preliminary alert straight to
 * the ordering doctor when the order came through an Ayuva referral, a
 * live board for the lab, and escalation to lab management when no
 * call-out is recorded in time.
 */
@Injectable()
export class PartnerLabCriticalService {
  private readonly logger = new Logger(PartnerLabCriticalService.name);

  constructor(
    @InjectModel(LabResult.name)
    private readonly resultModel: Model<LabResultDocument>,
    @InjectModel(PartnerLabOrder.name)
    private readonly orderModel: Model<LabOrderDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,
    private readonly notifier: PartnerNotifierService,
  ) {}

  /**
   * Tells the referring organisation — and the referring doctor by name — at
   * once, before sign-off. Returns false when the ordering doctor isn't on
   * Ayuva (the lab phones them and records the call-out).
   */
  async alertPhysician(
    actor: PartnerActor,
    order: LabOrderDocument,
    fresh: ResultRow[],
  ): Promise<boolean> {
    if (!order.referringProviderId) return false;
    const memberIds: string[] = [];
    if (order.referralId) {
      const ref = await this.referralModel
        .findById(order.referralId)
        .select('fromMemberId')
        .lean()
        .exec();
      if (ref?.fromMemberId) memberIds.push(ref.fromMemberId.toString());
    }
    const phone = actor.provider.phone ? ` Lab: ${actor.provider.phone}.` : '';
    await this.notifier.emit(order.referringProviderId, {
      trigger: PartnerTrigger.CRITICAL_LAB_RESULT,
      title: 'CRITICAL lab value — act now',
      message: `${actor.provider.name}, ${order.orderNo}: {patient} — ${describeCritical(fresh)}. Preliminary, before the pathologist's sign-off.${phone}`,
      patientId: order.patientId.toString(),
      safeMessage:
        'A patient you referred has a critical (panic) lab value — open the Ayuva Partner Portal now.',
      route: '/partner/patients',
      params: { patientId: order.patientId.toString() },
      data: {
        orderNo: order.orderNo,
        stage: 'preliminary',
        criticalValues: fresh.length,
      },
      memberIds,
    });
    return true;
  }

  /** Open critical values of the last two days, with call-out and escalation state. */
  async board(actor: PartnerActor) {
    const since = new Date(Date.now() - BOARD_HOURS * 3_600_000);
    const results = await this.resultModel
      .find({
        providerId: actor.provider._id,
        critical: true,
        criticalSince: { $gte: since },
      })
      .sort({ criticalSince: -1 })
      .limit(100)
      .exec();
    const orders = await this.orderModel
      .find({ _id: { $in: results.map((r) => r.orderId) } })
      .exec();
    const byId = new Map(orders.map((o) => [o.id, o]));
    return results.flatMap((r) => {
      const o = byId.get(r.orderId.toString());
      if (!o || o.status === LabOrderStatus.CANCELLED) return [];
      const last = o.criticalCallouts?.[o.criticalCallouts.length - 1];
      return [
        {
          orderId: o.id,
          orderNo: o.orderNo,
          patientName: o.patientName,
          values: r.tests.flatMap((t) =>
            t.values
              .filter((v) => isCriticalFlag(v.flag))
              .map((v) => ({
                name: v.name,
                value: v.value,
                unit: v.unit ?? null,
                flag: v.flag,
              })),
          ),
          since: r.criticalSince!.toISOString(),
          reportStatus: r.status,
          orderingDoctor: o.referringDoctorName ?? null,
          referringOrg: o.referringProviderName ?? null,
          physicianAlertedAt:
            r.criticalPhysicianAlertedAt?.toISOString() ?? null,
          escalatedAt: r.criticalEscalatedAt?.toISOString() ?? null,
          callout: last
            ? {
                at: last.at.toISOString(),
                notifiedName: last.notifiedName,
                method: last.method,
                readBack: last.readBack,
              }
            : null,
        },
      ];
    });
  }

  /** Every minute: critical values still without a call-out after the limit go to lab management. */
  @Interval(60_000)
  async escalateOverdue() {
    try {
      const now = Date.now();
      const candidates = await this.resultModel
        .find({
          critical: true,
          criticalSince: {
            $lte: new Date(now - ESCALATE_AFTER_MIN * 60_000),
            $gte: new Date(now - SWEEP_DAYS * 86_400_000),
          },
          criticalEscalatedAt: null,
        })
        .select('orderId providerId criticalSince')
        .limit(50)
        .lean()
        .exec();
      for (const c of candidates) {
        const order = await this.orderModel.findById(c.orderId).exec();
        if (
          !order ||
          order.criticalCallouts?.length ||
          order.status === LabOrderStatus.CANCELLED
        )
          continue;
        // Claim it, so two servers never escalate the same value twice.
        const claimed = await this.resultModel.updateOne(
          { _id: c._id, criticalEscalatedAt: null },
          { $set: { criticalEscalatedAt: new Date() } },
        );
        if (!claimed.modifiedCount) continue;
        await this.escalate(c.providerId, order, c.criticalSince!);
      }
    } catch (err) {
      this.logger.error('Critical value escalation sweep failed', err as Error);
    }
  }

  private async escalate(
    providerId: Types.ObjectId,
    order: LabOrderDocument,
    since: Date,
  ) {
    const minutes = Math.round((Date.now() - since.getTime()) / 60_000);
    const admins = await this.memberModel
      .find({ providerId, status: MemberStatus.ACTIVE, role: StaffRole.ADMIN })
      .select('_id')
      .lean()
      .exec();
    const doctor = order.referringDoctorName ?? 'the ordering doctor';
    await this.notifier.emit(providerId, {
      trigger: PartnerTrigger.CRITICAL_LAB_RESULT,
      title: `OVERDUE critical value — ${order.orderNo}`,
      message: `{patient}: a critical value flagged ${minutes} min ago still has no call-out recorded. Call ${doctor} now and record it in the Report Builder.`,
      patientId: order.patientId.toString(),
      safeMessage: `Order ${order.orderNo} has a critical value with no call-out recorded for ${minutes} minutes — act now in the Ayuva Partner Portal.`,
      route: '/partner/lab/critical',
      data: { orderId: order.id, orderNo: order.orderNo, stage: 'overdue' },
      memberIds: admins.map((a) => a._id.toString()),
    });
    order.statusHistory.push({
      at: new Date(),
      status: order.status,
      byName: 'Ayuva critical-value monitor',
      note: `Critical value not called out within ${ESCALATE_AFTER_MIN} min — escalated to lab management`,
    });
    await order.save();
  }
}
