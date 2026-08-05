import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../../core/users/schemas/user.schema';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotStatus,
} from '../../core/providers/schemas/appointment-slot.schema';
import {
  AIInteractionLog,
  AIInteractionLogDocument,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import {
  ReportInterpretation,
  ReportInterpretationDocument,
  ReportAiStatus,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { Medication, MedicationDocument } from '../../core/medications/schemas/medication.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
} from '../../core/records/schemas/medical-record.schema';
import { Provider, ProviderDocument } from '../../core/providers/schemas/provider.schema';
import {
  AdminAnalyticsOverviewResponseDto,
  UsageByModuleDto,
} from './dto/admin-analytics-overview-response.dto';
import { AiInteractionsOverTimePointDto } from './dto/admin-analytics-overview-response.dto';

const TREND_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const AI_INTERACTIONS_PERIOD_COUNT = 8;

export type AiInteractionsPeriod = 'daily' | 'weekly';

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(AppointmentSlot.name)
    private readonly slotModel: Model<AppointmentSlotDocument>,
    @InjectModel(AIInteractionLog.name)
    private readonly aiInteractionLogModel: Model<AIInteractionLogDocument>,
    @InjectModel(ReportInterpretation.name)
    private readonly reportInterpretationModel: Model<ReportInterpretationDocument>,
    @InjectModel(Medication.name)
    private readonly medicationModel: Model<MedicationDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly medicalRecordModel: Model<MedicalRecordDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
  ) {}

  async getOverview(): Promise<AdminAnalyticsOverviewResponseDto> {
    const now = new Date();
    const currentStart = new Date(now.getTime() - TREND_WINDOW_DAYS * DAY_MS);
    const previousStart = new Date(
      now.getTime() - 2 * TREND_WINDOW_DAYS * DAY_MS,
    );

    const totalUsers = await this.userModel.countDocuments({
      role: UserRole.PATIENT,
    });

    const [
      activeUsers,
      totalAppointments,
      upcomingAppointments,
      completedAppointments,
      cancelledAppointments,
      bookedSlots,
      openSlots,
      aiInteractionsTotal,
      reportsRead,
      totalUsers7d,
      totalUsersPrev7d,
      activeUsers7d,
      activeUsersPrev7d,
      appointments7d,
      appointmentsPrev7d,
      bookedSlots7d,
      bookedSlotsPrev7d,
      reportsRead7d,
      reportsReadPrev7d,
      usageByModule,
    ] = await Promise.all([
      this.userModel.countDocuments({
        role: UserRole.PATIENT,
        status: UserStatus.ACTIVE,
      }),
      this.appointmentModel.countDocuments({}),
      this.appointmentModel.countDocuments({
        status: AppointmentStatus.CONFIRMED,
      }),
      this.appointmentModel.countDocuments({
        status: AppointmentStatus.COMPLETED,
      }),
      this.appointmentModel.countDocuments({
        status: AppointmentStatus.CANCELLED,
      }),
      this.slotModel.countDocuments({ status: AppointmentSlotStatus.BOOKED }),
      this.slotModel.countDocuments({ status: AppointmentSlotStatus.OPEN }),
      // Phase 3 (AI services) isn't built yet — this is a real, honest count of
      // whatever AIInteractionLog holds today, not a fabricated figure (TRD §5.1 step 4).
      this.aiInteractionLogModel.countDocuments({}),
      this.reportInterpretationModel.countDocuments({
        aiStatus: ReportAiStatus.INTERPRETED,
      }),
      this.userModel.countDocuments({
        role: UserRole.PATIENT,
        createdAt: { $gte: currentStart },
      }),
      this.userModel.countDocuments({
        role: UserRole.PATIENT,
        createdAt: { $gte: previousStart, $lt: currentStart },
      }),
      this.userModel.countDocuments({
        role: UserRole.PATIENT,
        status: UserStatus.ACTIVE,
        createdAt: { $gte: currentStart },
      }),
      this.userModel.countDocuments({
        role: UserRole.PATIENT,
        status: UserStatus.ACTIVE,
        createdAt: { $gte: previousStart, $lt: currentStart },
      }),
      this.appointmentModel.countDocuments({
        createdAt: { $gte: currentStart },
      }),
      this.appointmentModel.countDocuments({
        createdAt: { $gte: previousStart, $lt: currentStart },
      }),
      this.slotModel.countDocuments({
        status: AppointmentSlotStatus.BOOKED,
        createdAt: { $gte: currentStart },
      }),
      this.slotModel.countDocuments({
        status: AppointmentSlotStatus.BOOKED,
        createdAt: { $gte: previousStart, $lt: currentStart },
      }),
      this.reportInterpretationModel.countDocuments({
        aiStatus: ReportAiStatus.INTERPRETED,
        createdAt: { $gte: currentStart },
      }),
      this.reportInterpretationModel.countDocuments({
        aiStatus: ReportAiStatus.INTERPRETED,
        createdAt: { $gte: previousStart, $lt: currentStart },
      }),
      this.getUsageByModule(totalUsers),
    ]);

    const utilisationDenominator = bookedSlots + openSlots;

    return {
      totalUsers,
      totalUsersTrendPercent: this.trendPercent(totalUsers7d, totalUsersPrev7d),
      activeUsers,
      activeUsersTrendPercent: this.trendPercent(
        activeUsers7d,
        activeUsersPrev7d,
      ),
      aiInteractions: {
        total: aiInteractionsTotal,
        // No prior period to compare against until Phase 3 exists — flat, not fabricated.
        trendPercent: 0,
      },
      appointments: {
        total: totalAppointments,
        upcoming: upcomingAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        trendPercent: this.trendPercent(appointments7d, appointmentsPrev7d),
      },
      providerUtilisation: {
        bookedSlots,
        openSlots,
        utilisationPercent: utilisationDenominator
          ? Math.round((bookedSlots / utilisationDenominator) * 100)
          : 0,
        trendPercent: this.trendPercent(bookedSlots7d, bookedSlotsPrev7d),
      },
      reportsRead,
      reportsReadTrendPercent: this.trendPercent(
        reportsRead7d,
        reportsReadPrev7d,
      ),
      usageByModule,
    };
  }

  async getAiInteractionsOverTime(
    period: AiInteractionsPeriod = 'weekly',
  ): Promise<AiInteractionsOverTimePointDto[]> {
    const periodMs = (period === 'daily' ? 1 : 7) * DAY_MS;
    const now = new Date();

    const periodStarts: Date[] = [];
    for (let i = AI_INTERACTIONS_PERIOD_COUNT - 1; i >= 0; i--) {
      periodStarts.push(new Date(now.getTime() - (i + 1) * periodMs));
    }
    const earliestStart = periodStarts[0];

    const rows = await this.aiInteractionLogModel.aggregate([
      { $match: { createdAt: { $gte: earliestStart } } },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: '$createdAt',
              unit: period === 'daily' ? 'day' : 'week',
              startOfWeek: 'monday',
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const countByPeriodStart = new Map<string, number>(
      rows.map((r: { _id: Date; count: number }) => [
        new Date(r._id).toISOString(),
        r.count,
      ]),
    );

    return periodStarts.map((start) => ({
      periodStart: start.toISOString(),
      count: countByPeriodStart.get(start.toISOString()) ?? 0,
    }));
  }

  private async getUsageByModule(
    totalUsers: number,
  ): Promise<UsageByModuleDto[]> {
    const [appointmentPatientIds, medicationUserIds, recordPatientIds, savedProviderUserIds] =
      await Promise.all([
        this.appointmentModel.distinct('patientId'),
        this.medicationModel.distinct('userId'),
        this.medicalRecordModel.distinct('patientId'),
        this.providerModel.distinct('savedByUserIds'),
      ]);

    const adoptionPercent = (distinctIds: unknown[]): number =>
      totalUsers > 0 ? Math.round((distinctIds.length / totalUsers) * 100) : 0;

    return [
      { module: 'appointments', adoptionPercent: adoptionPercent(appointmentPatientIds) },
      { module: 'medications', adoptionPercent: adoptionPercent(medicationUserIds) },
      { module: 'records', adoptionPercent: adoptionPercent(recordPatientIds) },
      {
        module: 'providers-saved',
        adoptionPercent: adoptionPercent(savedProviderUserIds),
      },
    ];
  }

  /** ((current - previous) / previous) * 100, rounded; 0 when previous is 0 (FR-11.1). */
  private trendPercent(current: number, previous: number): number {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }
}
