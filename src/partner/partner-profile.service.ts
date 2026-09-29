import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Provider, ProviderDocument } from '../core/providers/schemas/provider.schema';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotStatus,
} from '../core/providers/schemas/appointment-slot.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
} from '../core/payments/schemas/transaction.schema';
import { AdminProvidersService } from '../admin/providers/admin-providers.service';
import { ProviderScheduleDto } from '../admin/providers/dto/provider-schedule.dto';
import { BlockedDateDto } from '../admin/providers/dto/blocked-date.dto';
import { PartnerContextService } from './partner-context.service';
import { PartnerRecordsService } from './partner-records.service';
import { UpdatePartnerProfileDto } from './dto/partner.dto';

const EDITABLE_FIELDS = [
  'name',
  'specialty',
  'qualifications',
  'languages',
  'experienceYears',
  'consultationFee',
  'bio',
  'phone',
  'profileImageUrl',
  'requiresApproval',
  'locations',
] as const;

@Injectable()
export class PartnerProfileService {
  constructor(
    @InjectModel(Provider.name) private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name) private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Transaction.name) private readonly txModel: Model<TransactionDocument>,
    private readonly context: PartnerContextService,
    private readonly adminProviders: AdminProvidersService,
    private readonly records: PartnerRecordsService,
  ) {}

  async getMe(userId: string) {
    return this.toProfile(await this.context.getProvider(userId));
  }

  async updateProfile(userId: string, dto: UpdatePartnerProfileDto) {
    const provider = await this.context.requireLive(userId);
    for (const key of EDITABLE_FIELDS) {
      if (dto[key] !== undefined) provider.set(key, dto[key]);
    }
    await provider.save();
    return this.toProfile(provider);
  }

  async updateSchedule(userId: string, dto: ProviderScheduleDto) {
    const provider = await this.context.requireLive(userId);
    await this.adminProviders.updateSchedule(provider.id, dto);
    return this.getMe(userId);
  }

  async addBlockedDate(userId: string, dto: BlockedDateDto) {
    const provider = await this.context.requireLive(userId);
    await this.adminProviders.addBlockedDate(provider.id, dto);
    return this.getMe(userId);
  }

  async removeBlockedDate(userId: string, date: string) {
    const provider = await this.context.requireLive(userId);
    await this.adminProviders.removeBlockedDate(provider.id, date);
    return this.getMe(userId);
  }

  /** Upcoming open slots — targets when rescheduling or scheduling a follow-up. */
  async openSlots(userId: string, from?: string) {
    const provider = await this.context.requireLive(userId);
    const start = from ? new Date(from) : this.startOfTodayUtc();
    const slots = await this.slotModel
      .find({
        providerId: provider._id,
        status: AppointmentSlotStatus.OPEN,
        date: { $gte: start },
      })
      .sort({ date: 1, time: 1 })
      .limit(200)
      .exec();
    return slots.map((s) => ({
      id: s.id,
      date: s.date.toISOString().slice(0, 10),
      time: s.time,
      durationMin: s.durationMin,
    }));
  }

  /** P03 dashboard: today's appointments, pending items, recent shared reports. */
  async dashboard(userId: string) {
    const provider = await this.context.requireLive(userId);
    const dayStart = this.startOfTodayUtc();
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1));

    const appointments = await this.appointmentModel.find({ providerId: provider._id }).exec();
    const slots = await this.slotModel
      .find({ _id: { $in: appointments.map((a) => a.slotId) } })
      .exec();
    const slotById = new Map(slots.map((s) => [s.id, s]));

    const todays = appointments.filter((a) => {
      const s = slotById.get(a.slotId.toString());
      return (
        !!s &&
        s.date >= dayStart &&
        s.date < dayEnd &&
        [
          AppointmentStatus.CONFIRMED,
          AppointmentStatus.REQUESTED,
          AppointmentStatus.COMPLETED,
        ].includes(a.status)
      );
    });
    const pending = appointments.filter((a) => a.status === AppointmentStatus.REQUESTED);
    const upcoming = appointments.filter((a) => {
      const s = slotById.get(a.slotId.toString());
      return a.status === AppointmentStatus.CONFIRMED && !!s && s.date >= dayEnd;
    });
    const completedThisMonth = appointments.filter(
      (a) =>
        a.status === AppointmentStatus.COMPLETED &&
        !!a.completedAt &&
        a.completedAt >= monthStart,
    );

    const revenue = await this.txModel.aggregate<{ total: number }>([
      {
        $match: {
          providerId: provider._id,
          status: TransactionStatus.SUCCESSFUL,
          paidAt: { $gte: monthStart },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    return {
      provider: { id: provider.id, name: provider.name, status: provider.status },
      kpis: {
        todayCount: todays.length,
        pendingRequests: pending.length,
        upcomingCount: upcoming.length,
        completedThisMonth: completedThisMonth.length,
        revenueThisMonth: revenue[0]?.total ?? 0,
      },
      todaysAppointments: await this.records.describeAppointments(todays, slotById),
      pendingRequests: await this.records.describeAppointments(pending.slice(0, 5), slotById),
      recentSharedReports: await this.records.recentShares(provider.id, 5),
    };
  }

  private startOfTodayUtc(): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  private toProfile(p: ProviderDocument) {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      status: p.status,
      verificationNotes: p.verificationNotes,
      verifiedAt: p.verifiedAt?.toISOString(),
      email: p.email,
      phone: p.phone,
      registrationNumber: p.registrationNumber,
      specialty: p.specialty,
      qualifications: p.qualifications ?? [],
      languages: p.languages,
      experienceYears: p.experienceYears,
      consultationFee: p.consultationFee,
      bio: p.bio,
      profileImageUrl: p.profileImageUrl,
      requiresApproval: p.requiresApproval ?? false,
      locations: p.locations,
      rating: p.rating,
      schedule: p.schedule
        ? {
            workingDays: p.schedule.workingDays,
            startTime: p.schedule.startTime,
            endTime: p.schedule.endTime,
            slotDurationMin: p.schedule.slotDurationMin,
          }
        : undefined,
      blockedDates: p.blockedDates.map((b) => ({
        date: b.date.toISOString().slice(0, 10),
        reason: b.reason,
      })),
    };
  }
}
