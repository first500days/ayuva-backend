import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Model, QueryFilter, Types } from 'mongoose';
import {
  Provider,
  ProviderDocument,
  ProviderStatus,
  WorkingDay,
} from '../../core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotStatus,
} from '../../core/providers/schemas/appointment-slot.schema';
import { AdminCreateProviderDto } from './dto/admin-create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { QueryAdminProvidersDto } from './dto/query-admin-providers.dto';
import { ProviderScheduleDto } from './dto/provider-schedule.dto';
import { BlockedDateDto } from './dto/blocked-date.dto';
import { AdminProviderResponseDto } from './dto/admin-provider-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

// How far ahead AppointmentSlot documents are kept generated (FR-14.3).
const SLOT_GENERATION_WINDOW_DAYS = 14;

// JS Date#getDay(): 0=Sun..6=Sat.
const DOW_TO_WORKING_DAY: WorkingDay[] = [
  WorkingDay.SUN,
  WorkingDay.MON,
  WorkingDay.TUE,
  WorkingDay.WED,
  WorkingDay.THU,
  WorkingDay.FRI,
  WorkingDay.SAT,
];

@Injectable()
export class AdminProvidersService {
  constructor(
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
  ) {}

  async findAll(
    query: QueryAdminProvidersDto,
  ): Promise<AdminProviderResponseDto[]> {
    const and: QueryFilter<ProviderDocument>[] = [];

    if (query.search) {
      const re = buildSafeRegex(query.search);
      and.push({ $or: [{ name: re }, { specialty: re }] });
    }
    if (query.type) and.push({ type: query.type });
    if (query.specialty) {
      and.push({ specialty: buildSafeRegex(query.specialty) });
    }
    if (query.location) {
      const re = buildSafeRegex(query.location);
      and.push({
        $or: [{ 'locations.label': re }, { 'locations.address': re }],
      });
    }
    if (query.status) and.push({ status: query.status });

    const filter: QueryFilter<ProviderDocument> =
      and.length > 0 ? { $and: and } : {};

    const providers = await this.providerModel
      .find(filter)
      .sort({ name: 1 })
      .exec();
    return providers.map((p) => this.toResponse(p));
  }

  async create(dto: AdminCreateProviderDto): Promise<AdminProviderResponseDto> {
    const provider = await this.providerModel.create({
      name: dto.name,
      type: dto.type,
      specialty: dto.specialty,
      locations: dto.locations,
      languages: dto.languages,
      rating: dto.rating ?? 0,
      avgWaitMinutes: dto.avgWaitMinutes ?? 0,
      consultationFee: dto.consultationFee,
      status: dto.status ?? ProviderStatus.ACTIVE,
      profileImageUrl: dto.profileImageUrl,
    });
    return this.toResponse(provider);
  }

  async update(
    id: string,
    dto: UpdateProviderDto,
  ): Promise<AdminProviderResponseDto> {
    const provider = await this.getProviderOrThrow(id);

    if (dto.name !== undefined) provider.name = dto.name;
    if (dto.type !== undefined) provider.type = dto.type;
    if (dto.specialty !== undefined) provider.specialty = dto.specialty;
    if (dto.locations !== undefined) provider.locations = dto.locations;
    if (dto.languages !== undefined) provider.languages = dto.languages;
    if (dto.rating !== undefined) provider.rating = dto.rating;
    if (dto.avgWaitMinutes !== undefined)
      provider.avgWaitMinutes = dto.avgWaitMinutes;
    if (dto.consultationFee !== undefined)
      provider.consultationFee = dto.consultationFee;
    if (dto.profileImageUrl !== undefined)
      provider.profileImageUrl = dto.profileImageUrl;
    // FR-13.4: deactivating here is what excludes the provider from patient-facing
    // search — ProvidersService.findAll/findOne only ever match status=active.
    if (dto.status !== undefined) provider.status = dto.status;

    await provider.save();
    return this.toResponse(provider);
  }

  async updateSchedule(
    id: string,
    dto: ProviderScheduleDto,
  ): Promise<AdminProviderResponseDto> {
    const provider = await this.getProviderOrThrow(id);
    provider.schedule = {
      workingDays: dto.workingDays,
      startTime: dto.startTime,
      endTime: dto.endTime,
      slotDurationMin: dto.slotDurationMin,
    };
    await provider.save();
    await this.regenerateSlots(provider);
    return this.toResponse(provider);
  }

  async addBlockedDate(
    id: string,
    dto: BlockedDateDto,
  ): Promise<AdminProviderResponseDto> {
    const provider = await this.getProviderOrThrow(id);
    const date = this.parseDateOnly(dto.date);

    const alreadyBlocked = provider.blockedDates.some((b) =>
      this.isSameDay(b.date, date),
    );
    if (!alreadyBlocked) {
      provider.blockedDates.push({ date, reason: dto.reason });
      await provider.save();
    }

    // DC-4 (admin side): invalidate only OPEN slots on this date — a slot that's
    // already BOOKED keeps its status and its owning Appointment stays intact.
    await this.slotModel.updateMany(
      {
        providerId: provider._id,
        date: { $gte: date, $lt: this.addDays(date, 1) },
        status: AppointmentSlotStatus.OPEN,
      },
      {
        $set: {
          status: AppointmentSlotStatus.BLOCKED,
          blockedReason: dto.reason,
        },
      },
    );

    return this.toResponse(provider);
  }

  /**
   * Regenerates AppointmentSlot availability for the rolling window from a
   * provider's current schedule/blockedDates (FR-14.3, DC-4). A slot that is
   * already BOOKED is never modified or deleted, regardless of whether the new
   * schedule still offers that day/time — its owning Appointment must never be
   * orphaned.
   */
  private async regenerateSlots(provider: ProviderDocument): Promise<void> {
    const schedule = provider.schedule;
    const today = this.startOfDay(new Date());
    const rangeEnd = this.addDays(today, SLOT_GENERATION_WINDOW_DAYS);

    // Single round-trip for the whole window, then batch every change into at
    // most one bulkWrite + one deleteMany + one insertMany — this used to be
    // an individually-awaited find/save/create per slot per day, which is
    // hundreds of sequential round-trips against a real cluster.
    const existingSlots = await this.slotModel.find({
      providerId: provider._id,
      date: { $gte: today, $lt: rangeEnd },
    });
    const existingByDate = new Map<string, AppointmentSlotDocument[]>();
    for (const slot of existingSlots) {
      const key = slot.date.toISOString().slice(0, 10);
      const bucket = existingByDate.get(key);
      if (bucket) bucket.push(slot);
      else existingByDate.set(key, [slot]);
    }

    const bulkOps: AnyBulkWriteOperation<AppointmentSlot>[] = [];
    const idsToDelete: Types.ObjectId[] = [];
    const newSlots: Partial<AppointmentSlot>[] = [];

    for (let i = 0; i < SLOT_GENERATION_WINDOW_DAYS; i++) {
      const date = this.addDays(today, i);
      const dateKey = date.toISOString().slice(0, 10);
      const blockedEntry = provider.blockedDates.find((b) =>
        this.isSameDay(b.date, date),
      );
      const isWorkingDay =
        !!schedule &&
        schedule.workingDays.includes(DOW_TO_WORKING_DAY[date.getUTCDay()]);
      const desiredTimes = new Set<string>(
        isWorkingDay && !blockedEntry
          ? this.timesBetween(
              schedule.startTime,
              schedule.endTime,
              schedule.slotDurationMin,
            )
          : [],
      );

      for (const slot of existingByDate.get(dateKey) ?? []) {
        if (slot.status === AppointmentSlotStatus.BOOKED) {
          // Never touched — but don't also create a duplicate open slot at the same time.
          desiredTimes.delete(slot.time);
          continue;
        }

        if (desiredTimes.has(slot.time)) {
          if (
            slot.status !== AppointmentSlotStatus.OPEN ||
            slot.durationMin !== schedule!.slotDurationMin
          ) {
            bulkOps.push({
              updateOne: {
                filter: { _id: slot._id },
                update: {
                  $set: {
                    status: AppointmentSlotStatus.OPEN,
                    durationMin: schedule!.slotDurationMin,
                  },
                  $unset: { blockedReason: '' },
                },
              },
            });
          }
          desiredTimes.delete(slot.time);
        } else if (blockedEntry) {
          bulkOps.push({
            updateOne: {
              filter: { _id: slot._id },
              update: {
                $set: {
                  status: AppointmentSlotStatus.BLOCKED,
                  blockedReason: blockedEntry.reason,
                },
              },
            },
          });
        } else {
          // No longer offered under the new schedule and not booked/blocked — safe to drop.
          idsToDelete.push(slot._id);
        }
      }

      for (const time of desiredTimes) {
        newSlots.push({
          providerId: provider._id,
          date,
          time,
          durationMin: schedule!.slotDurationMin,
          status: AppointmentSlotStatus.OPEN,
        });
      }
    }

    if (bulkOps.length) await this.slotModel.bulkWrite(bulkOps);
    if (idsToDelete.length)
      await this.slotModel.deleteMany({ _id: { $in: idsToDelete } });
    if (newSlots.length) await this.slotModel.insertMany(newSlots);
  }

  private async getProviderOrThrow(id: string): Promise<ProviderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Provider not found');
    }
    const provider = await this.providerModel.findById(id);
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  private timesBetween(
    startTime: string,
    endTime: string,
    slotDurationMin: number,
  ): string[] {
    const start = this.toMinutes(startTime);
    const end = this.toMinutes(endTime);
    const times: string[] = [];
    for (let t = start; t + slotDurationMin <= end; t += slotDurationMin) {
      times.push(this.fromMinutes(t));
    }
    return times;
  }

  private toMinutes(time: string): number {
    const [h, m] = time.split(':').map((n) => parseInt(n, 10));
    return h * 60 + m;
  }

  private fromMinutes(total: number): string {
    const h = Math.floor(total / 60)
      .toString()
      .padStart(2, '0');
    const m = (total % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private startOfDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }

  private parseDateOnly(iso: string): Date {
    return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    );
  }

  private toResponse(provider: ProviderDocument): AdminProviderResponseDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      specialty: provider.specialty,
      locations: provider.locations,
      languages: provider.languages,
      rating: provider.rating,
      avgWaitMinutes: provider.avgWaitMinutes,
      consultationFee: provider.consultationFee,
      status: provider.status,
      profileImageUrl: provider.profileImageUrl,
      schedule: provider.schedule
        ? {
            workingDays: provider.schedule.workingDays,
            startTime: provider.schedule.startTime,
            endTime: provider.schedule.endTime,
            slotDurationMin: provider.schedule.slotDurationMin,
          }
        : undefined,
      blockedDates: provider.blockedDates.map((b) => ({
        date: b.date.toISOString().slice(0, 10),
        reason: b.reason,
      })),
    };
  }
}
