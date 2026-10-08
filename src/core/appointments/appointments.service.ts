import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from './schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotStatus,
} from '../providers/schemas/appointment-slot.schema';
import {
  Provider,
  ProviderDocument,
  ProviderStatus,
} from '../providers/schemas/provider.schema';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import {
  PatchAppointmentDto,
  PatientAppointmentAction,
} from './dto/patch-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { ReminderQueueService } from '../../notifications/queue/reminder-queue.service';
import { SharingService } from '../sharing/sharing.service';
import { PartnerNotifierService } from '../../partner/notify/partner-notifier.service';
import { PartnerTrigger } from '../../partner/notify/partner-triggers';

export type AppointmentsScope = 'upcoming' | 'past';

// Statuses that still hold a slot and can be acted on by the patient.
const ACTIVE_STATUSES = [AppointmentStatus.CONFIRMED, AppointmentStatus.REQUESTED];

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    private readonly reminderQueueService: ReminderQueueService,
    private readonly sharingService: SharingService,
    // Partner Notification Center ("New patient booking" etc.). Optional so unit
    // tests that build the service by hand don't need to supply it.
    @Optional()
    private readonly partnerNotifier?: PartnerNotifierService,
  ) {}

  async create(
    userId: string,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const provider = await this.providerModel.findOne({
      _id: dto.providerId,
      status: ProviderStatus.ACTIVE,
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    // DC-4: atomically flip open -> booked, scoped by a status guard so two
    // concurrent bookings can never both win the same slot.
    const slot = await this.slotModel.findOneAndUpdate(
      {
        _id: dto.slotId,
        providerId: new Types.ObjectId(dto.providerId),
        status: AppointmentSlotStatus.OPEN,
      },
      { $set: { status: AppointmentSlotStatus.BOOKED } },
      { returnDocument: 'after' },
    );
    if (!slot) {
      throw new ConflictException(
        'This slot is no longer available — please pick another time',
      );
    }

    try {
      const appointment = await this.appointmentModel.create({
        patientId: userId,
        providerId: dto.providerId,
        slotId: slot.id,
        // Partners who require approval get a REQUESTED booking to accept/reject (Partner Portal P05).
        status: provider.requiresApproval
          ? AppointmentStatus.REQUESTED
          : AppointmentStatus.CONFIRMED,
      });
      // System-initiated care-continuity nudge (PRD §7.1 Notifications) — not
      // gated behind the "Set reminder" toggle, which is specifically the
      // pre-visit reminder.
      await this.scheduleFollowUp(appointment, provider, slot);
      await this.notifyPartner(
        appointment,
        slot,
        PartnerTrigger.NEW_BOOKING,
        provider.requiresApproval
          ? 'New booking request'
          : 'New patient booking',
        provider.requiresApproval
          ? `{patient} requested ${this.describeSlot(slot)} — accept or decline it in Appointments.`
          : `{patient} booked ${this.describeSlot(slot)}.`,
      );
      return this.toResponse(appointment, provider, slot);
    } catch (err) {
      // Compensate: give the slot back if we booked it but couldn't persist the appointment.
      await this.slotModel
        .updateOne(
          { _id: slot.id },
          { $set: { status: AppointmentSlotStatus.OPEN } },
        )
        .catch((rollbackErr: unknown) =>
          this.logger.error(
            `Failed to roll back slot ${slot.id} after booking failure`,
            rollbackErr as Error,
          ),
        );
      throw err;
    }
  }

  async findAll(
    userId: string,
    scope?: AppointmentsScope,
  ): Promise<AppointmentResponseDto[]> {
    const statusFilter =
      scope === 'upcoming'
        ? ACTIVE_STATUSES
        : scope === 'past'
          ? [
              AppointmentStatus.COMPLETED,
              AppointmentStatus.CANCELLED_BY_PATIENT,
              AppointmentStatus.CANCELLED_BY_PROVIDER,
              AppointmentStatus.NO_SHOW,
            ]
          : undefined;

    const appointments = await this.appointmentModel
      .find({
        patientId: new Types.ObjectId(userId),
        ...(statusFilter ? { status: { $in: statusFilter } } : {}),
      })
      .sort({ createdAt: -1 })
      .exec();
    if (appointments.length === 0) return [];

    const slotIds = appointments.map((a) => a.slotId);
    const providerIds = appointments.map((a) => a.providerId);
    const [slots, providers] = await Promise.all([
      this.slotModel.find({ _id: { $in: slotIds } }).exec(),
      this.providerModel.find({ _id: { $in: providerIds } }).exec(),
    ]);
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const providerById = new Map(providers.map((p) => [p.id, p]));

    const results = appointments.map((a) =>
      this.toResponse(
        a,
        providerById.get(a.providerId.toString()),
        slotById.get(a.slotId.toString()),
      ),
    );

    // No explicit scope: surface upcoming first, then past, each date-ordered.
    if (!scope) {
      const upcoming = results
        .filter((r) => ACTIVE_STATUSES.includes(r.status as AppointmentStatus))
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
        );
      const past = results
        .filter((r) => !ACTIVE_STATUSES.includes(r.status as AppointmentStatus))
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || b.time.localeCompare(a.time),
        );
      return [...upcoming, ...past];
    }
    return results;
  }

  async update(
    id: string,
    userId: string,
    dto: PatchAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    if (!dto.status && !dto.newSlotId && dto.reminderEnabled === undefined) {
      throw new BadRequestException(
        'Provide status: "cancelled", newSlotId to reschedule, or reminderEnabled to toggle a reminder',
      );
    }

    const appointment = await this.getOwnedAppointmentOrThrow(id, userId);

    if (!ACTIVE_STATUSES.includes(appointment.status)) {
      throw new BadRequestException(
        'Only a confirmed appointment can be modified',
      );
    }

    if (dto.newSlotId) {
      return this.reschedule(appointment, dto.newSlotId);
    }

    if (dto.status === PatientAppointmentAction.CANCELLED) {
      return this.cancel(appointment);
    }

    if (dto.reminderEnabled !== undefined) {
      return this.setReminder(appointment, dto.reminderEnabled);
    }

    throw new BadRequestException(
      'Provide status: "cancelled", newSlotId to reschedule, or reminderEnabled to toggle a reminder',
    );
  }

  /** Admin-wide listing (PRD Admin Portal Appointment Slot Management) — not scoped to a single patient. */
  async adminFindAll(filters: {
    providerId?: string;
    status?: AppointmentStatus;
  }): Promise<AppointmentResponseDto[]> {
    const query: Record<string, unknown> = {};
    if (filters.providerId) {
      query.providerId = new Types.ObjectId(filters.providerId);
    }
    if (filters.status) {
      query.status = filters.status;
    }

    const appointments = await this.appointmentModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
    if (appointments.length === 0) return [];

    const slotIds = appointments.map((a) => a.slotId);
    const providerIds = appointments.map((a) => a.providerId);
    const [slots, providers] = await Promise.all([
      this.slotModel.find({ _id: { $in: slotIds } }).exec(),
      this.providerModel.find({ _id: { $in: providerIds } }).exec(),
    ]);
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const providerById = new Map(providers.map((p) => [p.id, p]));

    return appointments.map((a) =>
      this.toResponse(
        a,
        providerById.get(a.providerId.toString()),
        slotById.get(a.slotId.toString()),
      ),
    );
  }

  /**
   * Admin-side reschedule/cancel (PRD Admin Portal Appointment Slot
   * Management) — same reschedule()/cancel() logic as the patient path,
   * just without the ownership check (admin operates cross-patient by design).
   */
  async adminUpdate(
    id: string,
    dto: PatchAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    if (!dto.status && !dto.newSlotId) {
      throw new BadRequestException(
        'Provide status: "cancelled" to cancel, or newSlotId to reschedule',
      );
    }

    const appointment = await this.getAppointmentOrThrow(id);

    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException(
        'Only a confirmed appointment can be modified',
      );
    }

    if (dto.newSlotId) {
      return this.reschedule(appointment, dto.newSlotId);
    }

    if (dto.status === PatientAppointmentAction.CANCELLED) {
      return this.cancel(appointment);
    }

    throw new BadRequestException(
      'Provide status: "cancelled" to cancel, or newSlotId to reschedule',
    );
  }

  private async reschedule(
    appointment: AppointmentDocument,
    newSlotId: string,
  ): Promise<AppointmentResponseDto> {
    if (newSlotId === appointment.slotId.toString()) {
      throw new BadRequestException(
        'newSlotId must differ from the current slot',
      );
    }

    // Same atomic guard as create() — no double-booking on reschedule either.
    const newSlot = await this.slotModel.findOneAndUpdate(
      {
        _id: newSlotId,
        providerId: appointment.providerId,
        status: AppointmentSlotStatus.OPEN,
      },
      { $set: { status: AppointmentSlotStatus.BOOKED } },
      { returnDocument: 'after' },
    );
    if (!newSlot) {
      throw new ConflictException(
        'That slot is no longer available — please pick another time',
      );
    }

    const oldSlotId = appointment.slotId;
    appointment.slotId = newSlot._id;
    await appointment.save();

    await this.slotModel
      .updateOne(
        { _id: oldSlotId, status: AppointmentSlotStatus.BOOKED },
        { $set: { status: AppointmentSlotStatus.OPEN } },
      )
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to release old slot ${oldSlotId.toString()} after reschedule`,
          err as Error,
        ),
      );

    const provider = await this.providerModel.findById(appointment.providerId);

    // A stale reminder job firing for the old slot time is a real bug — cancel
    // and, if the patient still wants one, re-schedule against the new slot.
    await this.reminderQueueService.cancelAppointmentReminder(appointment.id);
    if (appointment.reminderEnabled) {
      await this.scheduleReminder(appointment, provider ?? undefined, newSlot);
    }
    // Same for the follow-up nudge — it's relative to the visit date, which just changed.
    await this.reminderQueueService.cancelFollowUpReminder(appointment.id);
    await this.scheduleFollowUp(appointment, provider ?? undefined, newSlot);
    // "This visit" record access follows the visit to its new time.
    await this.sharingService.syncVisitExpiry(appointment.id);
    await this.notifyPartner(
      appointment,
      newSlot,
      PartnerTrigger.BOOKING_CHANGED,
      'Booking rescheduled',
      `{patient}'s appointment moved to ${this.describeSlot(newSlot)}.`,
    );

    return this.toResponse(appointment, provider ?? undefined, newSlot);
  }

  private async cancel(
    appointment: AppointmentDocument,
  ): Promise<AppointmentResponseDto> {
    appointment.status = AppointmentStatus.CANCELLED_BY_PATIENT;
    await appointment.save();

    await this.slotModel
      .updateOne(
        { _id: appointment.slotId, status: AppointmentSlotStatus.BOOKED },
        { $set: { status: AppointmentSlotStatus.OPEN } },
      )
      .catch((err: unknown) =>
        this.logger.error(
          `Failed to release slot ${appointment.slotId.toString()} after cancellation`,
          err as Error,
        ),
      );

    // A stale job firing for a cancelled appointment is a real bug, not an edge case.
    await this.reminderQueueService.cancelAppointmentReminder(appointment.id);
    await this.reminderQueueService.cancelFollowUpReminder(appointment.id);
    // "This visit" record access ends with the visit.
    await this.sharingService.revokeForAppointment(
      appointment.id,
      'appointment_cancelled_by_patient',
    );

    const [provider, slot] = await Promise.all([
      this.providerModel.findById(appointment.providerId),
      this.slotModel.findById(appointment.slotId),
    ]);
    await this.notifyPartner(
      appointment,
      slot ?? undefined,
      PartnerTrigger.BOOKING_CHANGED,
      'Booking cancelled',
      `{patient} cancelled ${slot ? this.describeSlot(slot) : 'their appointment'} — the slot is open again.`,
    );
    return this.toResponse(
      appointment,
      provider ?? undefined,
      slot ?? undefined,
    );
  }

  /** Partner Notification Center hook — best-effort, never fails the patient's action. */
  private async notifyPartner(
    appointment: AppointmentDocument,
    slot: AppointmentSlotDocument | undefined,
    trigger: PartnerTrigger,
    title: string,
    message: string,
  ): Promise<void> {
    await this.partnerNotifier?.emit(appointment.providerId, {
      trigger,
      title,
      message,
      patientId: appointment.patientId.toString(),
      safeMessage:
        trigger === PartnerTrigger.NEW_BOOKING
          ? `${title}${slot ? ` for ${this.describeSlot(slot)}` : ''}.`
          : `${title}${slot ? ` (${this.describeSlot(slot)})` : ''}.`,
      route: '/partner/appointments',
      params: { appointmentId: appointment.id },
      data: {
        appointmentId: appointment.id,
        status: appointment.status,
        date: slot?.date.toISOString().slice(0, 10),
        time: slot?.time,
      },
    });
  }

  private describeSlot(slot: AppointmentSlotDocument): string {
    return `${slot.date.toISOString().slice(0, 10)} at ${slot.time}`;
  }

  private async setReminder(
    appointment: AppointmentDocument,
    enabled: boolean,
  ): Promise<AppointmentResponseDto> {
    appointment.reminderEnabled = enabled;
    await appointment.save();

    const [provider, slot] = await Promise.all([
      this.providerModel.findById(appointment.providerId),
      this.slotModel.findById(appointment.slotId),
    ]);

    if (enabled) {
      await this.scheduleReminder(appointment, provider ?? undefined, slot ?? undefined);
    } else {
      await this.reminderQueueService.cancelAppointmentReminder(appointment.id);
    }

    return this.toResponse(appointment, provider ?? undefined, slot ?? undefined);
  }

  private async scheduleReminder(
    appointment: AppointmentDocument,
    provider?: ProviderDocument,
    slot?: AppointmentSlotDocument,
  ): Promise<void> {
    if (!slot) return;
    await this.reminderQueueService.scheduleAppointmentReminder({
      id: appointment.id,
      userId: appointment.patientId.toString(),
      providerName: provider?.name ?? 'your provider',
      date: slot.date.toISOString().slice(0, 10),
      time: slot.time,
    });
  }

  private async scheduleFollowUp(
    appointment: AppointmentDocument,
    provider?: ProviderDocument,
    slot?: AppointmentSlotDocument,
  ): Promise<void> {
    if (!slot) return;
    await this.reminderQueueService.scheduleFollowUpReminder({
      id: appointment.id,
      userId: appointment.patientId.toString(),
      providerName: provider?.name ?? 'your provider',
      date: slot.date.toISOString().slice(0, 10),
      time: slot.time,
    });
  }

  private async getOwnedAppointmentOrThrow(
    id: string,
    userId: string,
  ): Promise<AppointmentDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Appointment not found');
    }
    const appointment = await this.appointmentModel.findById(id);
    if (!appointment || appointment.patientId.toString() !== userId) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  private async getAppointmentOrThrow(id: string): Promise<AppointmentDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Appointment not found');
    }
    const appointment = await this.appointmentModel.findById(id);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  private toResponse(
    appointment: AppointmentDocument,
    provider?: ProviderDocument,
    slot?: AppointmentSlotDocument,
  ): AppointmentResponseDto {
    return {
      id: appointment.id,
      providerId: appointment.providerId.toString(),
      providerName: provider?.name ?? 'Unknown provider',
      specialty: provider?.specialty?.join(' · ') ?? '',
      date: slot ? slot.date.toISOString().slice(0, 10) : '',
      time: slot?.time ?? '',
      status: appointment.status,
      reminderEnabled: appointment.reminderEnabled,
    };
  }
}
