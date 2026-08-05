import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../health-profile/schemas/health-profile.schema';
import {
  EmergencyContact,
  EmergencyContactDocument,
} from '../health-profile/schemas/emergency-contact.schema';
import {
  Medication,
  MedicationDocument,
} from '../medications/schemas/medication.schema';
import { CreateHealthProfileDto } from '../health-profile/dto/create-health-profile.dto';
import { CreateEmergencyContactDto } from '../health-profile/dto/create-emergency-contact.dto';
import { CreateMedicationDto } from '../medications/dto/create-medication.dto';
import { ReminderQueueService } from '../../notifications/queue/reminder-queue.service';

/**
 * Onboarding writes (TRD §4.1). Data captured here must be immediately
 * readable by other modules (PRD FR-2.7, DC-1) — every write here is a
 * plain synchronous upsert/insert, no queued/eventual-consistency step.
 */
@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(HealthProfile.name)
    private readonly healthProfileModel: Model<HealthProfileDocument>,
    @InjectModel(EmergencyContact.name)
    private readonly emergencyContactModel: Model<EmergencyContactDocument>,
    @InjectModel(Medication.name)
    private readonly medicationModel: Model<MedicationDocument>,
    private readonly reminderQueueService: ReminderQueueService,
  ) {}

  async upsertHealthProfile(
    userId: string,
    dto: CreateHealthProfileDto,
  ): Promise<HealthProfileDocument> {
    return this.healthProfileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $set: {
          age: dto.age,
          gender: dto.gender,
          conditions: dto.conditions,
          allergies: dto.allergies,
        },
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    );
  }

  async upsertEmergencyContact(
    userId: string,
    dto: CreateEmergencyContactDto,
  ): Promise<EmergencyContactDocument> {
    return this.emergencyContactModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: { name: dto.name, phone: dto.phone } },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
    );
  }

  async addMedication(
    userId: string,
    dto: CreateMedicationDto,
  ): Promise<MedicationDocument> {
    const medication = await this.medicationModel.create({
      userId,
      name: dto.name,
      dosage: dto.dosage,
      frequency: dto.frequency,
      scheduleTimes: dto.scheduleTimes,
      refillThresholdDays: dto.refillThresholdDays,
      active: dto.active ?? true,
    });

    // FR-10.3: a recurring reminder job per scheduled dose time, from creation onward.
    if (medication.active && medication.scheduleTimes.length > 0) {
      await this.reminderQueueService.scheduleMedicationReminders({
        id: medication.id,
        userId,
        name: medication.name,
        dosage: medication.dosage,
        scheduleTimes: medication.scheduleTimes,
      });
    }

    return medication;
  }
}
