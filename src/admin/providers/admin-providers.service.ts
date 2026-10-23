import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnyBulkWriteOperation, Model, QueryFilter, Types } from 'mongoose';
import {
  CredentialDocType,
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
import {
  ShareOrganisation,
  ShareOrganisationDocument,
} from '../../core/sharing/schemas/share-organisation.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../../core/appointments/schemas/appointment.schema';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../../partner/staff/schemas/partner-member.schema';
import { OrgType, StaffRole, orgTypeOf } from '../../partner/rbac/partner-permissions';
import {
  AdminDoctorCalendarResponseDto,
  AdminDoctorResponseDto,
  DoctorScheduleDto,
} from './dto/doctor-calendar.dto';
import { ProviderVerificationDto } from './dto/provider-verification.dto';
import { AdminCreateProviderDto } from './dto/admin-create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { QueryAdminProvidersDto } from './dto/query-admin-providers.dto';
import { ProviderScheduleDto } from './dto/provider-schedule.dto';
import { BlockedDateDto } from './dto/blocked-date.dto';
import {
  AdminProviderResponseDto,
  ProviderCredentialResponseDto,
} from './dto/admin-provider-response.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { systemFileName } from '../../common/utils/system-file-name.util';
import { StorageService } from '../../storage/storage.service';

// How far ahead AppointmentSlot documents are kept generated (FR-14.3).
const SLOT_GENERATION_WINDOW_DAYS = 14;

export const CREDENTIAL_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

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
  private readonly logger = new Logger(AdminProvidersService.name);

  constructor(
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(ShareOrganisation.name)
    private readonly orgModel: Model<ShareOrganisationDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    private readonly storage: StorageService,
  ) {}

  /**
   * regenerateSlots only ever runs as a side effect of an admin PUT'ing a
   * schedule (FR-14.3 window is relative to "now" at that moment) — with no
   * further admin action the rolling SLOT_GENERATION_WINDOW_DAYS window goes
   * stale and never advances. This keeps every provider with a configured
   * schedule bookable indefinitely, not just for 14 days after the last edit.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async regenerateAllProviderSlots(): Promise<void> {
    const providers = await this.providerModel
      .find({ schedule: { $exists: true } })
      .exec();
    for (const provider of providers) {
      try {
        await this.regenerateSlots(provider);
      } catch (err) {
        this.logger.error(
          `Failed to regenerate slots for provider ${provider.id}`,
          err as Error,
        );
      }
    }
  }

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

  /** Verification queue (A02): providers awaiting review, oldest first. */
  async verificationQueue(): Promise<AdminProviderResponseDto[]> {
    const providers = await this.providerModel
      .find({
        status: { $in: [ProviderStatus.PENDING, ProviderStatus.UNDER_REVIEW] },
      })
      .sort({ createdAt: 1 })
      .exec();
    return providers.map((p) => this.toResponse(p));
  }

  /** Gate before a Partner Portal account goes live: approve -> ACTIVE (patient-visible). */
  async verify(
    id: string,
    dto: ProviderVerificationDto,
  ): Promise<AdminProviderResponseDto> {
    const provider = await this.getProviderOrThrow(id);
    if (dto.decision === 'approve') {
      provider.status = ProviderStatus.ACTIVE;
      provider.verifiedAt = new Date();
    } else if (dto.decision === 'reject') {
      provider.status = ProviderStatus.REJECTED;
    } else {
      provider.status = ProviderStatus.UNDER_REVIEW;
    }
    if (dto.notes !== undefined) provider.verificationNotes = dto.notes;
    await provider.save();
    // Patients can only grant record access to a verified partner (P04).
    await this.orgModel.updateMany(
      { providerId: provider._id },
      { $set: { connected: dto.decision === 'approve' } },
    );
    return this.toResponse(provider);
  }

  /**
   * Takes a live provider offline (compliance dispute, failed re-verification):
   * patient search and new bookings only ever match status=active, and record
   * sharing to the organisation is cut until it is reactivated.
   */
  async suspend(id: string, reason: string): Promise<AdminProviderResponseDto> {
    const provider = await this.getProviderOrThrow(id);
    if (provider.status === ProviderStatus.SUSPENDED) {
      throw new BadRequestException(`${provider.name} is already paused`);
    }
    provider.status = ProviderStatus.SUSPENDED;
    provider.suspendedAt = new Date();
    provider.suspensionReason = reason.trim();
    await provider.save();
    await this.orgModel.updateMany(
      { providerId: provider._id },
      { $set: { connected: false } },
    );
    return this.toResponse(provider);
  }

  async reactivate(id: string): Promise<AdminProviderResponseDto> {
    const provider = await this.getProviderOrThrow(id);
    if (provider.status !== ProviderStatus.SUSPENDED) {
      throw new BadRequestException(`${provider.name} is not paused`);
    }
    provider.status = ProviderStatus.ACTIVE;
    provider.set('suspendedAt', undefined);
    provider.set('suspensionReason', undefined);
    await provider.save();
    // Partner organisations reconnect only if they had passed verification.
    if (provider.verifiedAt) {
      await this.orgModel.updateMany(
        { providerId: provider._id },
        { $set: { connected: true } },
      );
    }
    return this.toResponse(provider);
  }

  async listCredentials(id: string): Promise<ProviderCredentialResponseDto[]> {
    const provider = await this.getProviderOrThrow(id);
    return this.credentialsOf(provider);
  }

  /** Stores a licence / registration document, encrypted, under a system filename. */
  async addCredential(
    id: string,
    file: Express.Multer.File | undefined,
    docType: CredentialDocType,
    uploader: { userId: string; role: 'partner' | 'admin' },
  ): Promise<ProviderCredentialResponseDto> {
    if (!file) throw new BadRequestException('A file is required');
    if (!CREDENTIAL_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}" — upload a PDF, JPEG or PNG`,
      );
    }
    const provider = await this.getProviderOrThrow(id);
    const credentialId = new Types.ObjectId();
    const fileName = systemFileName(
      credentialId.toHexString(),
      file.mimetype,
      undefined,
      'credential',
    );
    const fileRef = await this.storage.upload(
      file.buffer,
      fileName,
      provider.id as string,
      'credentials',
    );
    provider.credentials.push({
      _id: credentialId,
      docType,
      fileRef,
      fileName,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedAt: new Date(),
      uploadedBy: new Types.ObjectId(uploader.userId),
      uploadedByRole: uploader.role,
    });
    await provider.save();
    return this.credentialsOf(provider).find((c) => c.id === credentialId.toHexString())!;
  }

  async readCredential(
    id: string,
    credentialId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const provider = await this.getProviderOrThrow(id);
    const credential = provider.credentials.find(
      (c) => c._id?.toString() === credentialId,
    );
    if (!credential) throw new NotFoundException('Document not found');
    return {
      buffer: await this.storage.read(credential.fileRef),
      fileName: credential.fileName,
      mimeType: credential.mimeType,
    };
  }

  private credentialsOf(provider: ProviderDocument): ProviderCredentialResponseDto[] {
    return (provider.credentials ?? []).map((c) => ({
      id: c._id!.toString(),
      docType: c.docType,
      fileName: c.fileName,
      mimeType: c.mimeType,
      sizeBytes: c.sizeBytes,
      uploadedAt: c.uploadedAt.toISOString(),
      uploadedByRole: c.uploadedByRole,
    }));
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

  async removeBlockedDate(
    id: string,
    dateIso: string,
  ): Promise<AdminProviderResponseDto> {
    const provider = await this.getProviderOrThrow(id);
    const date = this.parseDateOnly(dateIso);

    const hadEntry = provider.blockedDates.some((b) =>
      this.isSameDay(b.date, date),
    );
    if (hadEntry) {
      provider.blockedDates = provider.blockedDates.filter(
        (b) => !this.isSameDay(b.date, date),
      );
      await provider.save();
      // Re-derive slot status from the now-shorter blockedDates list — if the
      // day is still a working day, regenerateSlots flips its BLOCKED slots
      // back to OPEN; a BOOKED slot is still never touched either way.
      await this.regenerateSlots(provider);
    }

    return this.toResponse(provider);
  }

  /** Doctors on a facility's Partner Portal roster — Slot Management's second dropdown. */
  async listDoctors(id: string): Promise<AdminDoctorResponseDto[]> {
    const provider = await this.getProviderOrThrow(id);
    const members = await this.memberModel
      .find({ providerId: provider._id, status: { $ne: MemberStatus.SUSPENDED } })
      .sort({ fullName: 1 })
      .exec();
    // A clinic is its owner's own practice, so the owner is its doctor.
    const isClinic = orgTypeOf(provider.type) === OrgType.CLINIC;
    return members
      .filter((m) => m.role === StaffRole.DOCTOR || (isClinic && m.isOwner))
      .map((m) => this.toDoctor(m));
  }

  /**
   * One doctor's day: their duty blocks on that weekday and the facility's
   * slots inside them, with bookings assigned to this doctor marked. Slots
   * belong to the facility, so a slot outside the doctor's hours is left out
   * unless one of their own bookings sits in it.
   */
  async doctorCalendar(
    id: string,
    memberId: string,
    dateIso: string,
  ): Promise<AdminDoctorCalendarResponseDto> {
    const provider = await this.getProviderOrThrow(id);
    const member = await this.getDoctorOrThrow(provider, memberId);
    const date = this.parseDateOnly(dateIso);
    const weekday = DOW_TO_WORKING_DAY[date.getUTCDay()];
    const dutyBlocks = (member.dutySchedule ?? [])
      .filter((b) => b.day === weekday)
      .map((b) => ({ start: b.start, end: b.end }));

    const slots = await this.slotModel
      .find({ providerId: provider._id, date: { $gte: date, $lt: this.addDays(date, 1) } })
      .sort({ time: 1 })
      .exec();
    const assigned = await this.appointmentModel
      .find({ slotId: { $in: slots.map((s) => s._id) }, assignedMemberId: member._id })
      .select('slotId status')
      .exec();
    const assignedStatusBySlot = new Map(
      assigned.map((a) => [a.slotId.toString(), a.status as string]),
    );
    // HH:mm strings compare correctly as text.
    const onDuty = (time: string) => dutyBlocks.some((b) => time >= b.start && time < b.end);

    return {
      doctor: this.toDoctor(member),
      date: date.toISOString().slice(0, 10),
      dutyBlocks,
      blockedReason: provider.blockedDates.find((b) => this.isSameDay(b.date, date))?.reason,
      slots: slots
        .filter((s) => onDuty(s.time) || assignedStatusBySlot.has(s.id))
        .map((s) => ({
          id: s.id,
          time: s.time,
          durationMin: s.durationMin,
          status: s.status,
          assignedToDoctor: assignedStatusBySlot.has(s.id),
          appointmentStatus: assignedStatusBySlot.get(s.id),
        })),
    };
  }

  /** Sets one block of hours on each working day — replaces any split shifts on the roster. */
  async updateDoctorSchedule(
    id: string,
    memberId: string,
    dto: DoctorScheduleDto,
  ): Promise<AdminDoctorResponseDto> {
    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException('Duty hours must end after they start');
    }
    const provider = await this.getProviderOrThrow(id);
    const member = await this.getDoctorOrThrow(provider, memberId);
    member.dutySchedule = dto.workingDays.map((day) => ({
      day,
      start: dto.startTime,
      end: dto.endTime,
    }));
    await member.save();
    return this.toDoctor(member);
  }

  private async getDoctorOrThrow(
    provider: ProviderDocument,
    memberId: string,
  ): Promise<PartnerMemberDocument> {
    const member = Types.ObjectId.isValid(memberId)
      ? await this.memberModel.findOne({ _id: memberId, providerId: provider._id })
      : null;
    if (!member) throw new NotFoundException('Doctor not found on this provider\'s roster');
    return member;
  }

  private toDoctor(m: PartnerMemberDocument): AdminDoctorResponseDto {
    return {
      id: m.id,
      fullName: m.fullName,
      title: m.title,
      department: m.department,
      registrationNumber: m.registrationNumber,
      status: m.status,
      dutySchedule: (m.dutySchedule ?? []).map((b) => ({ day: b.day, start: b.start, end: b.end })),
    };
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
      email: provider.email,
      phone: provider.phone,
      registrationNumber: provider.registrationNumber,
      qualifications: provider.qualifications,
      verificationNotes: provider.verificationNotes,
      createdAt: (provider as { createdAt?: Date }).createdAt?.toISOString(),
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
      credentials: this.credentialsOf(provider),
      verifiedAt: provider.verifiedAt?.toISOString(),
      suspendedAt: provider.suspendedAt?.toISOString(),
      suspensionReason: provider.suspensionReason,
    };
  }
}
