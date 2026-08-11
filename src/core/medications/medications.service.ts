import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Medication, MedicationDocument } from './schemas/medication.schema';
import {
  MedicationLog,
  MedicationLogDocument,
  MedicationLogStatus,
} from './schemas/medication-log.schema';
import { CreateMedicationLogDto } from './dto/create-medication-log.dto';
import {
  MedicationsTodayResponseDto,
  MedicationTodayItemDto,
} from './dto/medication-today-response.dto';
import { MedicationLogResponseDto } from './dto/medication-log-response.dto';
import { RefillAlertResponseDto } from './dto/refill-alert-response.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { MedicationResponseDto } from './dto/medication-response.dto';
import { ReminderQueueService } from '../../notifications/queue/reminder-queue.service';

@Injectable()
export class MedicationsService {
  constructor(
    @InjectModel(Medication.name)
    private readonly medicationModel: Model<MedicationDocument>,
    @InjectModel(MedicationLog.name)
    private readonly medicationLogModel: Model<MedicationLogDocument>,
    private readonly reminderQueueService: ReminderQueueService,
  ) {}

  /** DC-1: reads straight off the live Medication collection — nothing cached or queued in between. */
  async getToday(userId: string): Promise<MedicationsTodayResponseDto> {
    const medications = await this.medicationModel
      .find({ userId: new Types.ObjectId(userId), active: true })
      .exec();
    if (medications.length === 0) {
      return {
        items: [],
        adherence: { takenCount: 0, totalCount: 0, percent: 0 },
      };
    }

    const { dayStart, dayEnd } = this.todayRange();
    const logs = await this.medicationLogModel
      .find({
        medicationId: { $in: medications.map((m) => m._id) },
        scheduledAt: { $gte: dayStart, $lte: dayEnd },
      })
      .exec();

    const now = Date.now();
    const items: MedicationTodayItemDto[] = [];

    for (const med of medications) {
      const medLogs = logs.filter((l) => l.medicationId.toString() === med.id);

      if (med.scheduleTimes.length === 0) {
        // "As needed" — a single unscheduled entry; taken if logged at all today.
        const log = medLogs[0];
        const status = log?.status ?? MedicationLogStatus.UPCOMING;
        items.push({
          medicationId: med.id,
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          scheduleTime: null,
          scheduledAt: null,
          status,
          isActionable: status === MedicationLogStatus.UPCOMING,
        });
        continue;
      }

      for (const time of med.scheduleTimes) {
        const scheduledAt = this.combineTodayAndTime(time);
        const log = medLogs.find(
          (l) => l.scheduledAt.getTime() === scheduledAt.getTime(),
        );
        const status = log?.status ?? MedicationLogStatus.UPCOMING;
        items.push({
          medicationId: med.id,
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          scheduleTime: time,
          scheduledAt: scheduledAt.toISOString(),
          status,
          isActionable:
            status === MedicationLogStatus.UPCOMING &&
            scheduledAt.getTime() <= now,
        });
      }
    }

    items.sort((a, b) =>
      (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'),
    );

    const takenCount = items.filter(
      (i) => i.status === MedicationLogStatus.TAKEN,
    ).length;
    const totalCount = items.length;
    return {
      items,
      adherence: {
        takenCount,
        totalCount,
        percent: totalCount ? Math.round((takenCount / totalCount) * 100) : 0,
      },
    };
  }

  async logDose(
    userId: string,
    medicationId: string,
    dto: CreateMedicationLogDto,
  ): Promise<MedicationLogResponseDto> {
    if (!Types.ObjectId.isValid(medicationId)) {
      throw new NotFoundException('Medication not found');
    }
    const medication = await this.medicationModel.findOne({
      _id: medicationId,
      userId: new Types.ObjectId(userId),
    });
    if (!medication) {
      throw new NotFoundException('Medication not found');
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid date-time');
    }

    const medicationObjectId = new Types.ObjectId(medicationId);
    const previous = await this.medicationLogModel.findOne({
      medicationId: medicationObjectId,
      scheduledAt,
    });
    const log = await this.medicationLogModel.findOneAndUpdate(
      { medicationId: medicationObjectId, scheduledAt },
      { $set: { status: dto.status, actionedAt: new Date() } },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    );

    // Simple adherence-linked supply decrement — only on a genuine upcoming/skipped -> taken transition.
    if (
      dto.status === MedicationLogStatus.TAKEN &&
      previous?.status !== MedicationLogStatus.TAKEN
    ) {
      const updated = await this.medicationModel.findOneAndUpdate(
        { _id: medicationId, suppliesRemainingDays: { $gt: 0 } },
        { $inc: { suppliesRemainingDays: -1 } },
        { returnDocument: 'after' },
      );
      // Push a refill nudge the moment supply crosses the threshold — not on
      // every dose logged afterward (dedupe is per medication+day in the queue).
      if (
        updated &&
        updated.suppliesRemainingDays <= updated.refillThresholdDays
      ) {
        await this.reminderQueueService.sendRefillReminder({
          medicationId: updated.id,
          userId,
          name: updated.name,
          suppliesRemainingDays: updated.suppliesRemainingDays,
        });
      }
    }

    return {
      id: log.id,
      medicationId: log.medicationId.toString(),
      scheduledAt: log.scheduledAt.toISOString(),
      status: log.status,
    };
  }

  async getRefillAlerts(userId: string): Promise<RefillAlertResponseDto[]> {
    const medications = await this.medicationModel
      .find({
        userId: new Types.ObjectId(userId),
        active: true,
        $expr: { $lte: ['$suppliesRemainingDays', '$refillThresholdDays'] },
      })
      .exec();

    return medications.map((m) => ({
      medicationId: m.id,
      name: m.name,
      dosage: m.dosage,
      suppliesRemainingDays: m.suppliesRemainingDays,
      refillThresholdDays: m.refillThresholdDays,
      label: `${m.suppliesRemainingDays} day${m.suppliesRemainingDays === 1 ? '' : 's'} left`,
    }));
  }

  async update(
    userId: string,
    medicationId: string,
    dto: UpdateMedicationDto,
  ): Promise<MedicationResponseDto> {
    const medication = await this.getOwnedMedicationOrThrow(
      userId,
      medicationId,
    );

    if (dto.name !== undefined) medication.name = dto.name;
    if (dto.dosage !== undefined) medication.dosage = dto.dosage;
    if (dto.frequency !== undefined) medication.frequency = dto.frequency;
    if (dto.scheduleTimes !== undefined)
      medication.scheduleTimes = dto.scheduleTimes;
    if (dto.refillThresholdDays !== undefined)
      medication.refillThresholdDays = dto.refillThresholdDays;
    if (dto.active !== undefined) medication.active = dto.active;
    await medication.save();

    // FR-10.3: reflect the edited schedule/dosage/active-state in the reminder queue.
    if (medication.active && medication.scheduleTimes.length > 0) {
      await this.reminderQueueService.rescheduleMedicationReminders({
        id: medication.id,
        userId,
        name: medication.name,
        dosage: medication.dosage,
        scheduleTimes: medication.scheduleTimes,
      });
    } else {
      await this.reminderQueueService.cancelMedicationReminders(
        medication.id,
      );
    }

    return {
      id: medication.id,
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency,
      scheduleTimes: medication.scheduleTimes,
      active: medication.active,
    };
  }

  async remove(userId: string, medicationId: string): Promise<void> {
    const medication = await this.getOwnedMedicationOrThrow(
      userId,
      medicationId,
    );
    await medication.deleteOne();
    // A stale job firing for a deleted medication is a real bug, not an edge case.
    await this.reminderQueueService.cancelMedicationReminders(medication.id);
  }

  private async getOwnedMedicationOrThrow(
    userId: string,
    medicationId: string,
  ): Promise<MedicationDocument> {
    if (!Types.ObjectId.isValid(medicationId)) {
      throw new NotFoundException('Medication not found');
    }
    const medication = await this.medicationModel.findOne({
      _id: medicationId,
      userId: new Types.ObjectId(userId),
    });
    if (!medication) {
      throw new NotFoundException('Medication not found');
    }
    return medication;
  }

  private todayRange(): { dayStart: Date; dayEnd: Date } {
    const now = new Date();
    const dayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const dayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );
    return { dayStart, dayEnd };
  }

  private combineTodayAndTime(time: string): Date {
    const [hours, minutes] = time.split(':').map((n) => parseInt(n, 10));
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours || 0,
      minutes || 0,
      0,
      0,
    );
  }
}
