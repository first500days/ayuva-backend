import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
import { ReminderQueueService } from '../notifications/queue/reminder-queue.service';
import { AppNotificationsService } from '../notifications/app-notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/schemas/audit-log.schema';
import { PartnerContextService } from './partner-context.service';
import { PartnerRecordsService } from './partner-records.service';
import { PartnerAppointmentsQueryDto } from './dto/partner.dto';
import { SharingService } from '../core/sharing/sharing.service';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from './staff/schemas/partner-member.schema';

/** P05 — appointment management. Slot/status changes are the same records the patient app and admin panel read, so they sync in real time. */
@Injectable()
export class PartnerAppointmentsService {
  constructor(
    @InjectModel(Appointment.name) private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name) private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(PartnerMember.name) private readonly memberModel: Model<PartnerMemberDocument>,
    private readonly context: PartnerContextService,
    private readonly records: PartnerRecordsService,
    private readonly reminders: ReminderQueueService,
    private readonly notifications: AppNotificationsService,
    private readonly audit: AuditLogService,
    private readonly sharing: SharingService,
  ) {}

  async list(userId: string, query: PartnerAppointmentsQueryDto) {
    const { provider, member } = await this.context.requireLiveContext(userId);
    const appointments = await this.appointmentModel
      .find({ providerId: provider._id, ...(query.mine && { assignedMemberId: member._id }) })
      .sort({ createdAt: -1 })
      .exec();
    const slots = await this.slotModel
      .find({ _id: { $in: appointments.map((a) => a.slotId) } })
      .exec();
    const slotById = new Map(slots.map((s) => [s.id, s]));

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const slotOf = (a: AppointmentDocument) => slotById.get(a.slotId.toString());

    const filtered = appointments.filter((a) => {
      const s = slotOf(a);
      switch (query.scope) {
        case 'incoming':
          return a.status === AppointmentStatus.REQUESTED;
        case 'today':
          return (
            !!s && s.date >= dayStart && s.date < dayEnd &&
            [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED].includes(a.status)
          );
        case 'upcoming':
          return a.status === AppointmentStatus.CONFIRMED && !!s && s.date >= dayEnd;
        case 'completed':
          return a.status === AppointmentStatus.COMPLETED;
        default:
          return true;
      }
    });

    const described = await this.records.describeAppointments(filtered, slotById);
    return described.sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
  }

  /** Assigns the visit to a practitioner (and department) — hospital OPD / multi-doctor clinics. */
  async assign(userId: string, id: string, memberId: string | null | undefined, department?: string) {
    const { appointment, providerId } = await this.load(userId, id);
    if (memberId === null) {
      appointment.assignedMemberId = undefined;
      appointment.assignedName = undefined;
    } else if (memberId) {
      const member = Types.ObjectId.isValid(memberId)
        ? await this.memberModel.findOne({ _id: memberId, providerId, status: MemberStatus.ACTIVE })
        : null;
      if (!member) throw new BadRequestException('That staff member is not active in your organisation');
      appointment.assignedMemberId = member._id;
      appointment.assignedName = member.fullName;
      if (!department && member.department) appointment.department = member.department;
      if (member.userId.toString() !== userId) {
        await this.notifications
          .create(member.userId.toString(), {
            trigger: 'partner_appointment_assignment',
            category: 'general',
            title: 'Appointment assigned to you',
            message: 'A patient visit was assigned to you — open Appointments for details.',
            lockScreenText: 'New assignment',
            actionLabel: 'Open',
            actionRoute: '/partner/appointments',
            actionParams: { appointmentId: appointment.id },
          })
          .catch(() => undefined);
      }
    }
    if (department !== undefined) appointment.department = department.trim() || undefined;
    await appointment.save();
    return this.one(userId, id, AuditAction.PARTNER_APPOINTMENT_UPDATE, 'assigned');
  }

  async accept(userId: string, id: string) {
    const { appointment } = await this.load(userId, id);
    if (appointment.status !== AppointmentStatus.REQUESTED) {
      throw new BadRequestException('Only a requested booking can be accepted');
    }
    appointment.status = AppointmentStatus.CONFIRMED;
    await appointment.save();
    await this.notify(appointment, 'booking_confirmed', 'Booking confirmed', 'Your appointment was accepted.');
    return this.one(userId, id, AuditAction.PARTNER_APPOINTMENT_UPDATE, 'accepted');
  }

  async reject(userId: string, id: string, reason?: string) {
    const { appointment } = await this.load(userId, id);
    if (![AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED].includes(appointment.status)) {
      throw new BadRequestException('This appointment can no longer be rejected');
    }
    appointment.status = AppointmentStatus.CANCELLED_BY_PROVIDER;
    appointment.cancelledAt = new Date();
    appointment.rejectionReason = reason;
    await appointment.save();
    await this.releaseSlot(appointment.slotId);
    await this.reminders.cancelAppointmentReminder(appointment.id);
    await this.reminders.cancelFollowUpReminder(appointment.id);
    // "This visit" record access ends with the visit.
    await this.sharing.revokeForAppointment(appointment.id, 'appointment_rejected_by_partner');
    await this.notify(
      appointment,
      'booking_changed',
      'Appointment declined',
      reason ? `Your provider could not take this booking: ${reason}` : 'Your provider could not take this booking.',
    );
    return this.one(userId, id, AuditAction.PARTNER_APPOINTMENT_UPDATE, 'rejected');
  }

  async reschedule(userId: string, id: string, newSlotId: string) {
    const { appointment, providerId } = await this.load(userId, id);
    if (![AppointmentStatus.REQUESTED, AppointmentStatus.CONFIRMED].includes(appointment.status)) {
      throw new BadRequestException('Only an active appointment can be rescheduled');
    }
    if (newSlotId === appointment.slotId.toString()) {
      throw new BadRequestException('newSlotId must differ from the current slot');
    }
    const newSlot = await this.claimSlot(providerId, newSlotId);
    const oldSlotId = appointment.slotId;
    appointment.slotId = newSlot._id;
    await appointment.save();
    await this.releaseSlot(oldSlotId);
    await this.sharing.syncVisitExpiry(appointment.id);

    await this.reminders.cancelAppointmentReminder(appointment.id);
    await this.reminders.cancelFollowUpReminder(appointment.id);
    await this.notify(
      appointment,
      'booking_changed',
      'Appointment rescheduled',
      `Your appointment moved to ${newSlot.date.toISOString().slice(0, 10)} at ${newSlot.time}.`,
    );
    return this.one(userId, id, AuditAction.PARTNER_APPOINTMENT_UPDATE, 'rescheduled');
  }

  async complete(userId: string, id: string) {
    const { appointment } = await this.load(userId, id);
    if (appointment.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException('Only a confirmed appointment can be completed');
    }
    appointment.status = AppointmentStatus.COMPLETED;
    appointment.completedAt = new Date();
    await appointment.save();
    return this.one(userId, id, AuditAction.PARTNER_APPOINTMENT_UPDATE, 'completed');
  }

  async scheduleFollowUp(userId: string, id: string, slotId: string) {
    const { appointment, providerId } = await this.load(userId, id);
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Follow-ups can be scheduled from a completed visit');
    }
    const slot = await this.claimSlot(providerId, slotId);
    let followUp: AppointmentDocument;
    try {
      followUp = await this.appointmentModel.create({
        patientId: appointment.patientId,
        providerId: appointment.providerId,
        slotId: slot._id,
        status: AppointmentStatus.CONFIRMED,
        followUpOfId: appointment._id,
      });
    } catch (err) {
      await this.releaseSlot(slot._id);
      throw err;
    }
    await this.notify(
      followUp,
      'booking_confirmed',
      'Follow-up scheduled',
      `Follow-up booked for ${slot.date.toISOString().slice(0, 10)} at ${slot.time}.`,
    );
    return this.one(userId, followUp.id, AuditAction.PARTNER_APPOINTMENT_UPDATE, 'follow_up_scheduled');
  }

  private async load(userId: string, id: string) {
    const provider = await this.context.requireLive(userId);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Appointment not found');
    const appointment = await this.appointmentModel.findOne({ _id: id, providerId: provider._id });
    if (!appointment) throw new NotFoundException('Appointment not found');
    return { appointment, providerId: provider._id };
  }

  private async claimSlot(providerId: Types.ObjectId, slotId: string) {
    if (!Types.ObjectId.isValid(slotId)) throw new NotFoundException('Slot not found');
    const slot = await this.slotModel.findOneAndUpdate(
      { _id: slotId, providerId, status: AppointmentSlotStatus.OPEN },
      { $set: { status: AppointmentSlotStatus.BOOKED } },
      { returnDocument: 'after' },
    );
    if (!slot) throw new ConflictException('That slot is no longer available');
    return slot;
  }

  private releaseSlot(slotId: Types.ObjectId) {
    return this.slotModel
      .updateOne(
        { _id: slotId, status: AppointmentSlotStatus.BOOKED },
        { $set: { status: AppointmentSlotStatus.OPEN } },
      )
      .exec();
  }

  private notify(appointment: AppointmentDocument, trigger: string, title: string, message: string) {
    return this.notifications
      .create(appointment.patientId.toString(), {
        trigger,
        category: 'appointments',
        title,
        message,
        lockScreenText: title,
        actionRoute: '/appointments',
        actionParams: { appointmentId: appointment.id },
      })
      .catch(() => undefined);
  }

  private async one(userId: string, id: string, action: AuditAction, change: string) {
    const provider = await this.context.requireLive(userId);
    const appointment = await this.appointmentModel.findById(id);
    if (!appointment) throw new NotFoundException('Appointment not found');
    const slot = await this.slotModel.findById(appointment.slotId);
    await this.audit.record({
      actorId: userId,
      action,
      targetType: 'Appointment',
      targetId: id,
      metadata: { change, providerId: provider.id },
    });
    const [described] = await this.records.describeAppointments(
      [appointment],
      new Map(slot ? [[slot.id, slot]] : []),
    );
    return described;
  }
}
