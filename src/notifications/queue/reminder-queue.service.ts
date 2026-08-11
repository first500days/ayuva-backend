import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  AppointmentReminderJobData,
  DocumentUploadJobData,
  FollowUpReminderJobData,
  MedicationReminderJobData,
  REMINDER_QUEUE,
  RefillReminderJobData,
  ReminderJobName,
  appointmentReminderJobId,
  documentUploadJobId,
  followUpReminderJobId,
  medicationReminderJobId,
  refillReminderJobId,
} from './reminder-queue.constants';

export interface MedicationForReminder {
  id: string;
  userId: string;
  name: string;
  dosage: string;
  scheduleTimes: string[];
}

export interface AppointmentForReminder {
  id: string;
  userId: string;
  providerName: string;
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm, 24h */
  time: string;
}

export interface RefillAlertForReminder {
  medicationId: string;
  userId: string;
  name: string;
  suppliesRemainingDays: number;
}

export interface DocumentUploadForConfirmation {
  recordId: string;
  userId: string;
  fileName: string;
}

/**
 * BullMQ producer for FR-10.3 (medication dose reminders) and FR-7.6
 * (appointment "Set reminder"). Callers schedule/cancel jobs on every
 * create/update/delete so a stale job never fires for deleted medication
 * or a cancelled/rescheduled appointment.
 */
@Injectable()
export class ReminderQueueService {
  private readonly logger = new Logger(ReminderQueueService.name);

  constructor(
    @Inject(REMINDER_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {}

  /** Schedules one recurring (daily, cron) reminder job scheduler per scheduleTime. */
  async scheduleMedicationReminders(
    medication: MedicationForReminder,
  ): Promise<void> {
    for (const time of medication.scheduleTimes) {
      const [hour, minute] = time.split(':').map((n) => parseInt(n, 10));
      if (Number.isNaN(hour) || Number.isNaN(minute)) continue;

      const schedulerId = medicationReminderJobId(medication.id, time);
      const data: MedicationReminderJobData = {
        type: ReminderJobName.MEDICATION,
        medicationId: medication.id,
        userId: medication.userId,
        name: medication.name,
        dosage: medication.dosage,
        scheduleTime: time,
      };
      await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: `${minute} ${hour} * * *` },
        {
          name: ReminderJobName.MEDICATION,
          data,
          opts: { removeOnComplete: true, removeOnFail: true },
        },
      );
    }
  }

  /** Removes every reminder job scheduler for this medication (deleted/deactivated/rescheduled). */
  async cancelMedicationReminders(medicationId: string): Promise<void> {
    const schedulers = await this.queue.getJobSchedulers();
    const prefix = `med-${medicationId}-`;
    const toRemove = schedulers
      .map((s) => s.id)
      .filter((id): id is string => !!id && id.startsWith(prefix));
    await Promise.all(
      toRemove.map((id) =>
        this.queue.removeJobScheduler(id).catch((err: unknown) =>
          this.logger.error(
            `Failed to remove reminder scheduler ${id}`,
            err as Error,
          ),
        ),
      ),
    );
  }

  /** Cancel-then-reschedule — simplest correct way to reflect an edited schedule/dosage. */
  async rescheduleMedicationReminders(
    medication: MedicationForReminder,
  ): Promise<void> {
    await this.cancelMedicationReminders(medication.id);
    if (medication.scheduleTimes.length > 0) {
      await this.scheduleMedicationReminders(medication);
    }
  }

  /** Schedules a one-off reminder `appointmentLeadMinutes` before the slot — only if that moment is still in the future. */
  async scheduleAppointmentReminder(
    appointment: AppointmentForReminder,
  ): Promise<void> {
    const leadMinutes =
      this.config.get<number>('reminders.appointmentLeadMinutes') ?? 60;
    const slotAt = new Date(`${appointment.date}T${appointment.time}:00`);
    const fireAt = new Date(slotAt.getTime() - leadMinutes * 60_000);
    const delay = fireAt.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.warn(
        `Skipped scheduling appointment reminder ${appointment.id} — reminder time already in the past`,
      );
      return;
    }

    const jobId = appointmentReminderJobId(appointment.id);
    const data: AppointmentReminderJobData = {
      type: ReminderJobName.APPOINTMENT,
      appointmentId: appointment.id,
      userId: appointment.userId,
      providerName: appointment.providerName,
      date: appointment.date,
      time: appointment.time,
    };
    await this.queue.add(ReminderJobName.APPOINTMENT, data, {
      jobId,
      delay,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  /** Removes a pending one-off appointment reminder (cancelled/rescheduled/reminder turned off). */
  async cancelAppointmentReminder(appointmentId: string): Promise<void> {
    const jobId = appointmentReminderJobId(appointmentId);
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove().catch((err: unknown) =>
        this.logger.error(
          `Failed to remove appointment reminder job ${jobId}`,
          err as Error,
        ),
      );
    }
  }

  /**
   * Immediate, at-most-once-per-day push when a dose log drops a medication's
   * supply to/below its refill threshold. Deduped by medicationId+date so
   * logging several doses the same day doesn't spam multiple pushes.
   */
  async sendRefillReminder(alert: RefillAlertForReminder): Promise<void> {
    const isoDate = new Date().toISOString().slice(0, 10);
    const jobId = refillReminderJobId(alert.medicationId, isoDate);
    const data: RefillReminderJobData = {
      type: ReminderJobName.REFILL,
      medicationId: alert.medicationId,
      userId: alert.userId,
      name: alert.name,
      suppliesRemainingDays: alert.suppliesRemainingDays,
    };
    await this.queue.add(ReminderJobName.REFILL, data, {
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  /** Immediate confirmation push that a medical record upload succeeded. */
  async sendDocumentUploadConfirmation(
    doc: DocumentUploadForConfirmation,
  ): Promise<void> {
    const data: DocumentUploadJobData = {
      type: ReminderJobName.DOCUMENT_UPLOAD,
      recordId: doc.recordId,
      userId: doc.userId,
      fileName: doc.fileName,
    };
    await this.queue.add(ReminderJobName.DOCUMENT_UPLOAD, data, {
      jobId: documentUploadJobId(doc.recordId),
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  /** Schedules a one-off nudge `followUpReminderLeadDays` after the visit — only if that moment is still in the future. */
  async scheduleFollowUpReminder(
    appointment: AppointmentForReminder,
  ): Promise<void> {
    const leadDays =
      this.config.get<number>('reminders.followUpLeadDays') ?? 3;
    const slotAt = new Date(`${appointment.date}T${appointment.time}:00`);
    const fireAt = new Date(slotAt.getTime() + leadDays * 24 * 60 * 60_000);
    const delay = fireAt.getTime() - Date.now();

    if (delay <= 0) {
      this.logger.warn(
        `Skipped scheduling follow-up reminder ${appointment.id} — reminder time already in the past`,
      );
      return;
    }

    const data: FollowUpReminderJobData = {
      type: ReminderJobName.FOLLOW_UP,
      appointmentId: appointment.id,
      userId: appointment.userId,
      providerName: appointment.providerName,
    };
    await this.queue.add(ReminderJobName.FOLLOW_UP, data, {
      jobId: followUpReminderJobId(appointment.id),
      delay,
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  /** Removes a pending follow-up reminder (appointment cancelled/rescheduled). */
  async cancelFollowUpReminder(appointmentId: string): Promise<void> {
    const jobId = followUpReminderJobId(appointmentId);
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove().catch((err: unknown) =>
        this.logger.error(
          `Failed to remove follow-up reminder job ${jobId}`,
          err as Error,
        ),
      );
    }
  }
}
