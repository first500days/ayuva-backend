import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CareJourney,
  CareJourneyDocument,
  CareStepStatus,
  CareJourneyStatus,
} from '../../ai/care-journey/schemas/care-journey.schema';
import { MedicationsService } from '../medications/medications.service';
import { MedicationLogStatus } from '../medications/schemas/medication-log.schema';
import { RecordsService } from '../records/records.service';
import { AppointmentsService } from '../appointments/appointments.service';
import {
  DashboardActiveJourneyDto,
  DashboardMedicationDto,
  DashboardNextVisitDto,
  DashboardReportDto,
  DashboardResponseDto,
} from './dto/dashboard-response.dto';

const RECENT_REPORTS_LIMIT = 3;

/**
 * Aggregates HealthProfile/CareJourney/Appointment/Medication/MedicalRecord
 * into the single payload the Patient Dashboard screen needs (TRD §4.2,
 * PRD FR-3.1-3.6). CareJourney is Phase-3-owned and may not exist yet for a
 * given user — that's handled as a null field, never an error.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(CareJourney.name)
    private readonly careJourneyModel: Model<CareJourneyDocument>,
    private readonly medicationsService: MedicationsService,
    private readonly recordsService: RecordsService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  async getDashboard(userId: string): Promise<DashboardResponseDto> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [activeJourney, nextVisit, medications, recentReports] =
      await Promise.all([
        this.getActiveJourney(userId),
        this.getNextVisit(userId),
        this.getMedications(userId),
        this.getRecentReports(userId),
      ]);

    return {
      profile: {
        fullName: user.fullName,
        initials: this.initialsOf(user.fullName),
      },
      activeJourney,
      nextVisit,
      medications,
      recentReports,
    };
  }

  private async getActiveJourney(
    userId: string,
  ): Promise<DashboardActiveJourneyDto | null> {
    const journey = await this.careJourneyModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: CareJourneyStatus.ACTIVE,
      })
      .sort({ updatedAt: -1 })
      .exec();
    if (!journey) return null;

    const currentIndex = journey.steps.findIndex(
      (s) => s.status === CareStepStatus.CURRENT,
    );
    const activeIndex =
      currentIndex >= 0
        ? currentIndex
        : journey.steps.findIndex((s) => s.status === CareStepStatus.UPCOMING);
    const step =
      activeIndex >= 0 ? activeIndex : Math.max(journey.steps.length - 1, 0);

    return {
      title: journey.title,
      step: `Step ${Math.min(step + 1, journey.steps.length)} of ${journey.steps.length}`,
      nextLabel: journey.steps[step]?.name ?? journey.title,
      progressPercent: journey.progressPct,
    };
  }

  private async getNextVisit(
    userId: string,
  ): Promise<DashboardNextVisitDto | null> {
    const [upcoming] = await this.appointmentsService.findAll(
      userId,
      'upcoming',
    );
    if (!upcoming) return null;
    return {
      provider: upcoming.providerName,
      specialty: upcoming.specialty,
      date: upcoming.date,
      time: upcoming.time,
    };
  }

  private async getMedications(
    userId: string,
  ): Promise<DashboardMedicationDto[]> {
    const { items } = await this.medicationsService.getToday(userId);
    return items.map((i) => ({
      id: i.medicationId,
      name: i.name,
      dosage: i.dosage,
      nextDue: i.scheduleTime ?? 'As needed',
      taken: i.status === MedicationLogStatus.TAKEN,
    }));
  }

  private async getRecentReports(
    userId: string,
  ): Promise<DashboardReportDto[]> {
    const records = await this.recordsService.findAll(userId);
    return records.slice(0, RECENT_REPORTS_LIMIT).map((r) => ({
      id: r.id,
      name: r.title,
      type: r.type,
      date: r.uploadedAt,
    }));
  }

  private initialsOf(fullName: string): string {
    return fullName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join('');
  }
}
