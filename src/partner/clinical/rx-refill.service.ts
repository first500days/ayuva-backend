import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../../core/appointments/schemas/appointment.schema';
import { UserPushService } from '../../notifications/user-push.service';
import { refillPromptAt } from './rx-course';
import {
  Prescription,
  PrescriptionDocument,
  PrescriptionStatus,
} from './schemas/prescription.schema';
import {
  RxRefillPrompt,
  RxRefillPromptDocument,
} from './schemas/rx-refill-prompt.schema';

const SWEEP_MS = 15 * 60_000;
/** Prescriptions older than this aren't backfilled with a prompt. */
const BACKFILL_DAYS = 180;
const ACTIVE_BOOKING = [
  AppointmentStatus.REQUESTED,
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
];

/**
 * "Your prescription is nearly finished": when a signed e-prescription's
 * course reaches 85 %, the patient gets a push prompting a follow-up booking,
 * unless they already have one booked with that clinic since it was signed.
 * The push names no medicine (it can show on a lock screen). Each prompt is
 * claimed once, so several API instances don't double-send.
 */
@Injectable()
export class RxRefillService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RxRefillService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(Prescription.name)
    private readonly rxModel: Model<PrescriptionDocument>,
    @InjectModel(RxRefillPrompt.name)
    private readonly promptModel: Model<RxRefillPromptDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly push: UserPushService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Plans the prompt for a newly signed prescription. Never throws. */
  async plan(rx: PrescriptionDocument): Promise<void> {
    try {
      if (rx.status !== PrescriptionStatus.SIGNED || !rx.signedAt) return;
      await this.promptModel
        .updateOne(
          { prescriptionId: rx._id },
          {
            $setOnInsert: {
              patientId: rx.patientId,
              providerId: rx.providerId,
              promptAt: refillPromptAt(rx.signedAt, rx.items ?? []),
            },
          },
          { upsert: true },
        )
        .exec();
    } catch (err) {
      this.logger.warn(`refill plan failed for ${rx.id}: ${String(err)}`);
    }
  }

  async sweep(now = new Date()): Promise<number> {
    let sent = 0;
    try {
      await this.backfill(now);
      const due = await this.promptModel
        .find({
          promptAt: { $ne: null, $lte: now },
          sentAt: { $exists: false },
        })
        .limit(200)
        .exec();
      for (const p of due) {
        const claim = await this.promptModel
          .updateOne(
            { _id: p._id, sentAt: { $exists: false } },
            { $set: { sentAt: now } },
          )
          .exec();
        if (claim.modifiedCount !== 1) continue;
        const rx = await this.rxModel
          .findById(p.prescriptionId)
          .select('signedAt status')
          .lean()
          .exec();
        if (!rx || rx.status !== PrescriptionStatus.SIGNED) {
          await this.promptModel
            .updateOne({ _id: p._id }, { $set: { skipped: 'not signed' } })
            .exec();
          continue;
        }
        const booked = await this.appointmentModel.exists({
          patientId: p.patientId,
          providerId: p.providerId,
          status: { $in: ACTIVE_BOOKING },
          createdAt: { $gte: rx.signedAt },
        });
        if (booked) {
          await this.promptModel
            .updateOne(
              { _id: p._id },
              { $set: { skipped: 'follow-up booked' } },
            )
            .exec();
          continue;
        }
        await this.push
          .send(p.patientId.toString(), {
            title: 'Your prescription is nearly finished',
            body: 'Book a follow-up if your doctor wanted to see you again, or ask about a refill.',
            data: {
              type: 'rx_refill',
              prescriptionId: p.prescriptionId.toString(),
              providerId: p.providerId.toString(),
            },
          })
          .catch((err: unknown) =>
            this.logger.warn(`refill push failed: ${String(err)}`),
          );
        sent++;
      }
    } catch (err) {
      this.logger.debug(`refill sweep failed: ${String(err)}`);
    }
    return sent;
  }

  /** Prescriptions signed before this feature (or while a write failed) get their prompt planned. */
  private async backfill(now: Date): Promise<void> {
    const since = new Date(now.getTime() - BACKFILL_DAYS * 86_400_000);
    const planned = await this.promptModel
      .find({ createdAt: { $gte: since } })
      .select('prescriptionId')
      .lean()
      .exec();
    const rxs = await this.rxModel
      .find({
        status: PrescriptionStatus.SIGNED,
        signedAt: { $gte: since },
        _id: { $nin: planned.map((p) => p.prescriptionId) },
      })
      .limit(500)
      .exec();
    for (const rx of rxs) await this.plan(rx);
  }
}
