import { Injectable, NotFoundException } from '@nestjs/common';
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
import { UpdateAccountDto } from './dto/update-account.dto';
import { User, UserDocument } from '../users/schemas/user.schema';
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
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly reminderQueueService: ReminderQueueService,
  ) {}

  /**
   * The patient's own account record. Every screen that greets the user by
   * name reads it from the login response, so an edit that only lived in the
   * app's local cache was lost on the next sign-in.
   */
  async getAccount(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  async updateAccount(
    userId: string,
    dto: UpdateAccountDto,
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { fullName: dto.fullName.trim() },
        { new: true },
      )
      .exec();
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  /** FR-2.6: onboarding is skippable, so this is informational only. */
  async hasHealthProfile(userId: string): Promise<boolean> {
    const count = await this.healthProfileModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .limit(1);
    return count > 0;
  }

  async getHealthProfile(
    userId: string,
  ): Promise<HealthProfileDocument | null> {
    return this.healthProfileModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
  }

  async getEmergencyContact(
    userId: string,
  ): Promise<EmergencyContactDocument | null> {
    return this.emergencyContactModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
  }

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
