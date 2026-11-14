import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LiveBus } from '../../../common/live/live-bus.service';
import { dateStart } from '../../../partner/hospital/clock';
import { UserPushService } from '../../../notifications/user-push.service';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotStatus,
} from '../../providers/schemas/appointment-slot.schema';
import {
  Provider,
  ProviderDocument,
} from '../../providers/schemas/provider.schema';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../schemas/appointment.schema';
import { pickWaiters } from './waitlist-rules';
import { WaitlistEntry, WaitlistEntryDocument } from './waitlist.schema';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_BOOKING = [
  AppointmentStatus.REQUESTED,
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
];

/**
 * Appointment waitlist. When a booking is cancelled or declined its slot opens
 * (announced on the live bus), and the first few people waiting for that
 * provider get a push to book it. The push says nothing about the provider or
 * specialty, since it can show on a lock screen; the app opens the booking page.
 */
@Injectable()
export class WaitlistService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaitlistService.name);
  private off?: () => void;

  constructor(
    @InjectModel(WaitlistEntry.name)
    private readonly waitModel: Model<WaitlistEntryDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly push: UserPushService,
    private readonly live: LiveBus,
  ) {}

  onModuleInit(): void {
    this.off = this.live.onSlotOpened((slotId) => void this.slotOpened(slotId));
  }

  onModuleDestroy(): void {
    this.off?.();
  }

  async join(
    userId: string,
    dto: { providerId: string; fromDay?: string; toDay?: string },
  ) {
    if (!Types.ObjectId.isValid(dto.providerId))
      throw new NotFoundException('Provider not found');
    if (
      (dto.fromDay && !DAY.test(dto.fromDay)) ||
      (dto.toDay && !DAY.test(dto.toDay))
    )
      throw new BadRequestException('Days are YYYY-MM-DD');
    if (dto.fromDay && dto.toDay && dto.toDay < dto.fromDay)
      throw new BadRequestException('The last day is before the first');
    const provider = await this.providerModel
      .findById(dto.providerId)
      .select('name')
      .lean()
      .exec();
    if (!provider) throw new NotFoundException('Provider not found');
    const entry = await this.waitModel
      .findOneAndUpdate(
        {
          userId: new Types.ObjectId(userId),
          providerId: provider._id,
          status: 'waiting',
        },
        {
          $set: { fromDay: dto.fromDay, toDay: dto.toDay },
          $setOnInsert: { notifiedCount: 0 },
        },
        { upsert: true, new: true },
      )
      .exec();
    return this.toResponse(entry, provider.name);
  }

  async mine(userId: string) {
    const rows = await this.waitModel
      .find({ userId: new Types.ObjectId(userId), status: 'waiting' })
      .sort({ createdAt: -1 })
      .exec();
    const names = new Map(
      (
        await this.providerModel
          .find({ _id: { $in: rows.map((r) => r.providerId) } })
          .select('name')
          .lean()
          .exec()
      ).map((p) => [p._id.toString(), p.name]),
    );
    return rows.map((r) =>
      this.toResponse(r, names.get(r.providerId.toString()) ?? 'Provider'),
    );
  }

  async leave(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Not on this waitlist');
    const res = await this.waitModel
      .updateOne(
        { _id: id, userId: new Types.ObjectId(userId), status: 'waiting' },
        { $set: { status: 'left' } },
      )
      .exec();
    if (!res.modifiedCount) throw new NotFoundException('Not on this waitlist');
    return { left: true };
  }

  /** A slot opened: tell the first few people waiting for that provider. Never throws. */
  async slotOpened(slotId: string, now = new Date()): Promise<number> {
    try {
      const slot = await this.slotModel.findById(slotId).lean().exec();
      if (!slot || slot.status !== AppointmentSlotStatus.OPEN) return 0;
      const day = slot.date.toISOString().slice(0, 10);
      const [h, m] = slot.time.split(':').map(Number);
      const at = new Date(
        dateStart(day).getTime() + ((h || 0) * 60 + (m || 0)) * 60_000,
      );
      const waiting = await this.waitModel
        .find({ providerId: slot.providerId, status: 'waiting' })
        .sort({ createdAt: 1 })
        .limit(200)
        .exec();
      if (!waiting.length) return 0;
      const booked = await this.appointmentModel
        .find({
          providerId: slot.providerId,
          patientId: { $in: waiting.map((w) => w.userId) },
          status: { $in: ACTIVE_BOOKING },
        })
        .select('patientId')
        .lean()
        .exec();
      const picked = pickWaiters(
        waiting.map((w) => ({
          id: w.id,
          userId: w.userId.toString(),
          from: w.fromDay,
          to: w.toDay,
          createdAt: w.createdAt ?? new Date(0),
          lastNotifiedAt: w.lastNotifiedAt,
        })),
        { day, at },
        now,
        new Set(booked.map((b) => b.patientId.toString())),
      );
      for (const p of picked) {
        await this.waitModel
          .updateOne(
            { _id: p.id },
            { $set: { lastNotifiedAt: now }, $inc: { notifiedCount: 1 } },
          )
          .exec();
        await this.push
          .send(p.userId, {
            title: 'An appointment slot just opened',
            body: 'A time you were waiting for is free. Tap to book it before it goes.',
            data: {
              type: 'waitlist_slot',
              providerId: slot.providerId.toString(),
              slotId: slot._id.toString(),
            },
          })
          .catch((err: unknown) =>
            this.logger.warn(`waitlist push failed: ${String(err)}`),
          );
      }
      if (picked.length)
        this.logger.log(`Slot ${slotId} opened: told ${picked.length} waiting`);
      return picked.length;
    } catch (err) {
      this.logger.warn(
        `waitlist dispatch failed for ${slotId}: ${String(err)}`,
      );
      return 0;
    }
  }

  private toResponse(e: WaitlistEntryDocument, providerName: string) {
    return {
      id: e.id,
      providerId: e.providerId.toString(),
      providerName,
      fromDay: e.fromDay ?? null,
      toDay: e.toDay ?? null,
      joinedAt: (e.createdAt ?? new Date()).toISOString(),
      notifiedCount: e.notifiedCount ?? 0,
      lastNotifiedAt: e.lastNotifiedAt?.toISOString() ?? null,
    };
  }
}
