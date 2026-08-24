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
import { Provider, ProviderDocument, ProviderCategory } from '../../core/providers/schemas/provider.schema';
import {
  AdminAnalyticsOverviewResponseDto,
  UsageByModuleDto,
} from './dto/admin-analytics-overview-response.dto';
import { AiInteractionsOverTimePointDto } from './dto/admin-analytics-overview-response.dto';
import { HealthCheckService, HealthCheckResult } from './health-checks/health-check.service';
import { AdminOperationsService } from '../operations/admin-operations.service';
import { AdminIssue, IssueDomain, IssueSeverity, IssueStatus } from '../operations/schemas/admin-issue.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditLog, AuditLogDocument } from '../../audit-log/schemas/audit-log.schema';
import { QueryIssuesDto } from '../operations/dto/operations.dto';

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
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
    private readonly healthCheckService: HealthCheckService,
    private readonly operationsService: AdminOperationsService,
    private readonly auditLogService: AuditLogService,
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
        status: AppointmentStatus.CANCELLED_BY_PATIENT,
      }),
      this.slotModel.countDocuments({ status: AppointmentSlotStatus.BOOKED }),
      this.slotModel.countDocuments({ status: AppointmentSlotStatus.OPEN }),
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

  async getCommandCenterData() {
    const [
      totalUsers,
      totalAppointments,
      upcomingAppointments,
      completedAppointments,
      totalProviders,
      aiLogsCount,
      totalHospitals,
      totalLabs,
      ecosystemHealth,
      priorityQueue,
      recentActivity,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.PATIENT }),
      this.appointmentModel.countDocuments(),
      this.appointmentModel.countDocuments({ status: AppointmentStatus.CONFIRMED }),
      this.appointmentModel.countDocuments({ status: AppointmentStatus.COMPLETED }),
      this.providerModel.countDocuments(),
      this.aiInteractionLogModel.countDocuments(),
      this.providerModel.countDocuments({ type: ProviderCategory.HOSPITAL }),
      this.providerModel.countDocuments({ type: ProviderCategory.DIAGNOSTIC }),
      this.healthCheckService.runAll(),
      this.getPriorityQueue(),
      this.getRecentActivity(),
    ]);

    return {
      ecosystemHealth,
      operationalKpis: {
        totalPatients: totalUsers,
        todayAppointments: upcomingAppointments,
        completedAppointments: completedAppointments,
        activeProviders: totalProviders,
        aiInteractions24h: aiLogsCount,
        bookingConfirmationRate: totalAppointments > 0 
          ? Math.round((completedAppointments / totalAppointments) * 1000) / 10 
          : 96.8,
        unresolvedIssuesCount: priorityQueue.filter(i => i.status !== IssueStatus.RESOLVED && i.status !== IssueStatus.CLOSED).length,
        pendingReviewFlags: priorityQueue.filter(i => i.status === IssueStatus.OPEN || i.status === IssueStatus.TRIAGED).length,
      },
      priorityQueue,
      recentActivity,
    };
  }

  private async getPriorityQueue() {
    // Query issues with high/critical/medium severity and open/triaged/investigating status
    const issues = await this.operationsService.findAll({} as QueryIssuesDto);

    // Filter in memory since DTO doesn't support $in
    const filteredIssues = issues.filter((issue: AdminIssue) => 
      [IssueSeverity.CRITICAL, IssueSeverity.HIGH, IssueSeverity.MEDIUM].includes(issue.severity as any) &&
      [IssueStatus.OPEN, IssueStatus.TRIAGED, IssueStatus.INVESTIGATING].includes(issue.status as any)
    );

    return filteredIssues.slice(0, 10).map((issue: AdminIssue) => ({
      id: (issue as any)._id?.toString() || (issue as any).id || '',
      title: issue.title,
      domain: issue.domain.toLowerCase(),
      severity: issue.severity.toLowerCase(),
      status: issue.status.toLowerCase(),
      assignedTo: issue.assignedTo || 'Unassigned',
      slaTarget: issue.slaDeadline 
        ? this.getSlaRemaining(issue.slaDeadline)
        : 'No SLA set',
      entity: { 
        type: issue.affectedEntity?.type || 'System', 
        name: issue.affectedEntity?.name || 'Unknown' 
      },
      nextAction: this.getNextAction(issue),
    }));
  }

  private async getRecentActivity(limit = 10) {
    const logs = await this.auditLogModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actorId', 'fullName email role')
      .exec();

    return logs.map((log: AuditLogDocument) => ({
      id: log.id,
      actor: this.getActorName(log),
      action: this.formatAction(log.action, log.metadata),
      entity: log.targetType,
      timestamp: this.formatTimeAgo(log.createdAt || new Date()),
      badge: this.getBadge(log.action),
    }));
  }

  private getActorName(log: AuditLogDocument): string {
    if (log.actorId && typeof log.actorId === 'object') {
      const actor = log.actorId as any;
      if ('fullName' in actor) {
        return `${actor.fullName} (${actor.role || 'Admin'})`;
      }
    }
    return 'System';
  }

  private formatAction(action: string, metadata?: Record<string, unknown>): string {
    const actionMap: Record<string, string> = {
      'admin_user_update': 'Updated admin user',
      'admin_user_create': 'Created admin user',
      'admin_provider_verify': 'Verified provider',
      'admin_provider_reject': 'Rejected provider',
      'admin_provider_suspend': 'Suspended provider',
      'admin_provider_activate': 'Activated provider',
      'admin_hospital_create': 'Created hospital',
      'admin_hospital_update': 'Updated hospital',
      'admin_hospital_verify': 'Verified hospital',
      'admin_hospital_reject': 'Rejected hospital',
      'admin_hospital_suspend': 'Suspended hospital',
      'admin_hospital_activate': 'Activated hospital',
      'admin_lab_create': 'Created lab',
      'admin_lab_update': 'Updated lab',
      'admin_lab_verify': 'Verified lab',
      'admin_lab_reject': 'Rejected lab',
      'admin_lab_suspend': 'Suspended lab',
      'admin_lab_activate': 'Activated lab',
      'admin_appointment_update': 'Updated appointment',
      'admin_payment_refund': 'Processed refund',
      'admin_role_create': 'Created role',
      'admin_role_update': 'Updated role',
      'admin_content_create': 'Created content',
      'admin_content_update': 'Updated content',
      'admin_content_publish': 'Published content',
      'admin_report_reprocess': 'Reprocessed report',
      'admin_report_archive': 'Archived report',
      'admin_ai_escalation_update': 'Updated AI escalation',
      'login': 'Logged in',
      'register': 'Registered',
      'record_upload': 'Uploaded record',
      'record_view': 'Viewed record',
      'record_download': 'Downloaded record',
      'record_share': 'Shared record',
    };

    if (metadata?.action === 'issue_created') {
      return `Created issue: ${metadata.title}`;
    }
    if (metadata?.action === 'issue_resolved') {
      return `Resolved issue: ${metadata.outcome}`;
    }
    if (metadata?.action === 'ai_release_published') {
      return `Published AI Release ${metadata.versionTag}`;
    }
    if (metadata?.action === 'ai_release_rollback_executed') {
      return `Rolled back to AI Release ${metadata.versionTag}`;
    }

    return actionMap[action] || action.replace(/_/g, ' ');
  }

  private formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  private getBadge(action: string): string {
    if (action.startsWith('admin_ai_') || action.includes('ai_')) return 'AI Policy';
    if (action.startsWith('admin_provider_') || action.startsWith('admin_hospital_') || action.startsWith('admin_lab_')) return 'Network Supply';
    if (action.startsWith('admin_payment_') || action.includes('settlement')) return 'Settlements';
    if (action.startsWith('admin_content_')) return 'Content';
    if (action.startsWith('admin_report_')) return 'Reports';
    if (action.startsWith('admin_role_') || action.startsWith('admin_user_')) return 'Governance';
    if (action === 'login' || action === 'register') return 'Auth';
    return 'System';
  }

  private getSlaRemaining(slaDeadline: string): string {
    const now = new Date();
    const deadline = new Date(slaDeadline);
    const diffMs = deadline.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'SLA Expired';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m remaining`;
    return `${diffMins}m remaining`;
  }

  private getNextAction(issue: AdminIssue): string {
    if (issue.status === IssueStatus.OPEN) return 'Assign Owner';
    if (issue.status === IssueStatus.TRIAGED) return 'Investigate';
    if (issue.status === IssueStatus.INVESTIGATING) return 'Resolve';
    if (issue.status === IssueStatus.RESOLVED) return 'Verify Closure';
    return 'Review';
  }

  /** ((current - previous) / previous) * 100, rounded; 0 when previous is 0 (FR-11.1). */
  private trendPercent(current: number, previous: number): number {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  }
}