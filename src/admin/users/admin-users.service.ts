import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import {
  User,
  UserDocument,
  UserRole,
} from '../../core/users/schemas/user.schema';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../../core/health-profile/schemas/health-profile.schema';
import {
  Appointment,
  AppointmentDocument,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
} from '../../core/providers/schemas/appointment-slot.schema';
import { Provider, ProviderDocument } from '../../core/providers/schemas/provider.schema';
import {
  Medication,
  MedicationDocument,
} from '../../core/medications/schemas/medication.schema';
import {
  MedicationLog,
  MedicationLogDocument,
} from '../../core/medications/schemas/medication-log.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
} from '../../core/records/schemas/medical-record.schema';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import {
  AdminUserResponseDto,
  ActivityLevel,
} from './dto/admin-user-response.dto';
import { AdminUserActivityItemDto } from './dto/admin-user-activity-item.dto';
import { buildSafeRegex } from '../../common/utils/regex.util';

const ACTIVITY_WINDOW_DAYS = 30;
// Combined Appointment + MedicationLog action count in the trailing window (FR-12.1) —
// a simple, honest signal available today; not an invented ML/engagement score.
const HIGH_ACTIVITY_THRESHOLD = 5;
const MEDIUM_ACTIVITY_THRESHOLD = 1;

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(HealthProfile.name)
    private readonly healthProfileModel: Model<HealthProfileDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly appointmentSlotModel: Model<AppointmentSlotDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(Medication.name)
    private readonly medicationModel: Model<MedicationDocument>,
    @InjectModel(MedicationLog.name)
    private readonly medicationLogModel: Model<MedicationLogDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly medicalRecordModel: Model<MedicalRecordDocument>,
  ) {}

  async findAll(query: QueryAdminUsersDto): Promise<AdminUserResponseDto[]> {
    const and: QueryFilter<UserDocument>[] = [{ role: UserRole.PATIENT }];

    if (query.search) {
      const re = buildSafeRegex(query.search);
      and.push({ $or: [{ fullName: re }, { email: re }] });
    }
    if (query.status) {
      and.push({ status: query.status });
    }
    if (query.joinedFrom || query.joinedTo) {
      const range: Record<string, Date> = {};
      if (query.joinedFrom) range.$gte = new Date(query.joinedFrom);
      if (query.joinedTo) range.$lte = new Date(query.joinedTo);
      and.push({ createdAt: range });
    }

    const filter: QueryFilter<UserDocument> =
      and.length > 1 ? { $and: and } : and[0];

    const users = await this.userModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
    if (users.length === 0) return [];

    const profiles = await this.healthProfileModel
      .find({ userId: { $in: users.map((u) => u._id) } })
      .exec();
    const ageByUserId = new Map(
      profiles.map((p) => [p.userId.toString(), p.age]),
    );

    const activityCountByUserId = await this.getActivityCounts(
      users.map((u) => u._id),
    );

    return users.map((u) =>
      this.toResponse(
        u,
        ageByUserId.get(u.id),
        activityCountByUserId.get(u.id) ?? 0,
      ),
    );
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
  ): Promise<AdminUserResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }
    const user = await this.userModel.findOneAndUpdate(
      { _id: id, role: UserRole.PATIENT },
      { $set: { status: dto.status } },
      { returnDocument: 'after' },
    );
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = await this.healthProfileModel.findOne({ userId: user._id });
    const activityCountByUserId = await this.getActivityCounts([user._id]);
    return this.toResponse(
      user,
      profile?.age,
      activityCountByUserId.get(user.id) ?? 0,
    );
  }

  async getActivityHistory(id: string): Promise<AdminUserActivityItemDto[]> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }
    const user = await this.userModel.findOne({
      _id: id,
      role: UserRole.PATIENT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const userId = user._id;

    const [appointments, medications, records] = await Promise.all([
      this.appointmentModel.find({ patientId: userId }).exec(),
      this.medicationModel.find({ userId }).exec(),
      this.medicalRecordModel.find({ patientId: userId }).exec(),
    ]);

    const [slots, providers] = await Promise.all([
      this.appointmentSlotModel
        .find({ _id: { $in: appointments.map((a) => a.slotId) } })
        .exec(),
      this.providerModel
        .find({ _id: { $in: appointments.map((a) => a.providerId) } })
        .exec(),
    ]);
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const providerById = new Map(providers.map((p) => [p.id, p]));

    const medicationLogs = medications.length
      ? await this.medicationLogModel
          .find({ medicationId: { $in: medications.map((m) => m._id) } })
          .exec()
      : [];
    const medicationById = new Map(medications.map((m) => [m.id, m]));

    const appointmentItems: AdminUserActivityItemDto[] = appointments.map(
      (a) => {
        const slot = slotById.get(a.slotId.toString());
        const provider = providerById.get(a.providerId.toString());
        const occurredAt = slot?.date ?? new Date(0);
        return {
          type: 'appointment',
          label: `Appointment with ${provider?.name ?? 'Unknown provider'} — ${a.status}`,
          occurredAt: occurredAt.toISOString(),
        };
      },
    );

    const medicationLogItems: AdminUserActivityItemDto[] = medicationLogs.map(
      (l) => {
        const medication = medicationById.get(l.medicationId.toString());
        const occurredAt = l.actionedAt ?? l.scheduledAt;
        return {
          type: 'medicationLog',
          label: `${medication?.name ?? 'Unknown medication'} — ${l.status}`,
          occurredAt: occurredAt.toISOString(),
        };
      },
    );

    const recordItems: AdminUserActivityItemDto[] = records.map((r) => ({
      type: 'record',
      label: `${r.originalFileName} (${r.type})`,
      occurredAt: (r.uploadedAt ?? new Date(0)).toISOString(),
    }));

    return [...appointmentItems, ...medicationLogItems, ...recordItems].sort(
      (a, b) => (a.occurredAt < b.occurredAt ? 1 : -1),
    );
  }

  /** Combined Appointment + MedicationLog count in the trailing window, per user (FR-12.1). */
  private async getActivityCounts(
    userIds: Types.ObjectId[],
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const since = new Date(
      Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [appointments, medications] = await Promise.all([
      this.appointmentModel
        .find({ patientId: { $in: userIds }, createdAt: { $gte: since } })
        .exec(),
      this.medicationModel.find({ userId: { $in: userIds } }).exec(),
    ]);

    const counts = new Map<string, number>();
    for (const a of appointments) {
      const key = a.patientId.toString();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    if (medications.length > 0) {
      const userIdByMedicationId = new Map(
        medications.map((m) => [m.id, m.userId.toString()]),
      );
      const medicationLogs = await this.medicationLogModel
        .find({
          medicationId: { $in: medications.map((m) => m._id) },
          createdAt: { $gte: since },
        })
        .exec();
      for (const log of medicationLogs) {
        const userId = userIdByMedicationId.get(log.medicationId.toString());
        if (!userId) continue;
        counts.set(userId, (counts.get(userId) ?? 0) + 1);
      }
    }

    return counts;
  }

  private toActivityLevel(count: number): ActivityLevel {
    if (count >= HIGH_ACTIVITY_THRESHOLD) return 'high';
    if (count >= MEDIUM_ACTIVITY_THRESHOLD) return 'medium';
    return 'low';
  }

  private toResponse(
    user: UserDocument,
    age: number | undefined,
    activityCount: number,
  ): AdminUserResponseDto {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      age,
      role: user.role,
      status: user.status,
      joinedAt: (user.createdAt ?? new Date(0)).toISOString(),
      activityLevel: this.toActivityLevel(activityCount),
    };
  }
}
