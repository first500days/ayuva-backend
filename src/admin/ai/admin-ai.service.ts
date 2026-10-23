import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AIInteractionLog,
  AIInteractionLogDocument,
  AiReviewStatus,
  AiService,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import {
  ReportInterpretation,
  ReportInterpretationDocument,
  ReportReleaseStatus,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
  RecordStatusEnhanced,
} from '../../core/records/schemas/medical-record.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import { QueryAiLogsDto } from './dto/query-ai-logs.dto';
import { UpdateEscalationDto } from './dto/update-escalation.dto';
import { AdminAiOverviewResponseDto } from './dto/admin-ai-overview-response.dto';
import { AdminAiLogResponseDto } from './dto/admin-ai-log-response.dto';

/** Who took a review action — recorded on the log and in the audit trail. */
export interface AiReviewer {
  id: string;
  email: string;
}

const PENDING_REVIEW = [AiReviewStatus.NONE, AiReviewStatus.ASSIGNED];

@Injectable()
export class AdminAiService {
  constructor(
    @InjectModel(AIInteractionLog.name)
    private readonly logModel: Model<AIInteractionLogDocument>,
    @InjectModel(ReportInterpretation.name)
    private readonly interpretationModel: Model<ReportInterpretationDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    private readonly auditLogService: AuditLogService,
    private readonly notifications: AppNotificationsService,
  ) {}

  async getOverview(): Promise<AdminAiOverviewResponseDto> {
    const logs = await this.logModel.find({}).exec();

    const totalPrompts = logs.length;
    const flaggedCount = logs.filter((l) => l.flagged).length;
    const pendingReviewCount = logs.filter(
      (l) => l.flagged && PENDING_REVIEW.includes(l.reviewStatus as AiReviewStatus),
    ).length;
    const avgResponseTimeMs = totalPrompts
      ? Math.round(logs.reduce((sum, l) => sum + l.latencyMs, 0) / totalPrompts)
      : 0;
    // No explicit success/failure outcome field on the log yet — a flagged
    // interaction is the only signal we have that something needed review.
    const successRatePercent = totalPrompts
      ? Math.round(((totalPrompts - flaggedCount) / totalPrompts) * 100)
      : 0;

    const countByService = new Map<AiService, number>();
    for (const l of logs) {
      countByService.set(l.service, (countByService.get(l.service) ?? 0) + 1);
    }
    // Zeroed per known service so the honest-empty contract holds even with no logs at all.
    const byService = Object.values(AiService).map((service) => ({
      service,
      count: countByService.get(service) ?? 0,
    }));

    return {
      totalPrompts,
      avgResponseTimeMs,
      successRatePercent,
      flaggedCount,
      pendingReviewCount,
      byService,
    };
  }

  async getLogs(query: QueryAiLogsDto): Promise<AdminAiLogResponseDto[]> {
    const logs = await this.logModel
      .find(query.service ? { service: query.service } : {})
      .sort({ createdAt: -1 })
      .exec();
    return this.toResponses(logs);
  }

  async getEscalations(): Promise<AdminAiLogResponseDto[]> {
    const logs = await this.logModel
      .find({ flagged: true })
      .sort({ createdAt: -1 })
      .exec();
    return this.toResponses(logs);
  }

  async updateEscalation(
    id: string,
    dto: UpdateEscalationDto,
  ): Promise<AdminAiLogResponseDto> {
    const log = await this.getFlaggedLogOrThrow(id);

    if (dto.reviewStatus !== undefined) log.reviewStatus = dto.reviewStatus;
    if (dto.assignedTo !== undefined)
      log.assignedTo = new Types.ObjectId(dto.assignedTo);
    if (dto.resolutionNotes !== undefined)
      log.resolutionNotes = dto.resolutionNotes;

    await log.save();
    return (await this.toResponses([log]))[0];
  }

  /**
   * "Approve & Send to Patient": a reviewer confirms the output. The flag is
   * cleared and a report summary is released to the patient's app, marked as
   * clinician-verified. Duplicate flags for the same summary close with it.
   */
  async approve(
    id: string,
    notes: string | undefined,
    reviewer: AiReviewer,
  ): Promise<AdminAiLogResponseDto> {
    const log = await this.getFlaggedLogOrThrow(id);
    const now = new Date();
    const interpretation = await this.interpretationFor(log);
    if (interpretation) {
      interpretation.releaseStatus = ReportReleaseStatus.RELEASED;
      interpretation.verifiedAt = now;
      interpretation.verifiedBy = reviewer.email;
      interpretation.reviewNotes = notes?.trim() || undefined;
      await interpretation.save();
      await this.recordModel.updateOne(
        { _id: interpretation.recordId, status: RecordStatusEnhanced.NEEDS_REVIEW },
        { $set: { status: RecordStatusEnhanced.INTERPRETED } },
      );
      // No PHI on a lock screen: the notification only says a summary is ready.
      await this.notifications.create(log.userId.toString(), {
        trigger: 'report_summary_released',
        category: 'documents',
        title: 'Your report summary is ready',
        message: 'A reviewed plain-language summary of your report is now available.',
        lockScreenText: 'A report summary is ready in AYUVA',
        actionLabel: 'Open',
        actionRoute: '/report/[id]',
        actionParams: { id: interpretation.recordId.toString() },
      });
    }

    await this.closeReview(log, interpretation, {
      reviewStatus: AiReviewStatus.RESOLVED,
      reviewAction: 'approved',
      notes,
      reviewer,
      at: now,
    });
    await this.auditLogService.record({
      actorId: reviewer.id,
      action: AuditAction.ADMIN_AI_OUTPUT_APPROVE,
      targetType: 'AIInteractionLog',
      targetId: log.id,
      metadata: { service: log.service, released: !!interpretation },
    });
    return (await this.toResponses([log]))[0];
  }

  /**
   * "Block & Send to Human Doctor Review": the output is taken out of the
   * patient's view (a report summary reads as "being reviewed" in the app)
   * and the item moves to the doctor review queue, where a clinician later
   * approves it or keeps it blocked.
   */
  async escalate(
    id: string,
    notes: string | undefined,
    reviewer: AiReviewer,
  ): Promise<AdminAiLogResponseDto> {
    const log = await this.getFlaggedLogOrThrow(id);
    const now = new Date();
    const interpretation = await this.interpretationFor(log);
    if (interpretation) {
      interpretation.releaseStatus = ReportReleaseStatus.ESCALATED;
      interpretation.set('verifiedAt', undefined);
      interpretation.set('verifiedBy', undefined);
      interpretation.reviewNotes = notes?.trim() || undefined;
      await interpretation.save();
      await this.recordModel.updateOne(
        { _id: interpretation.recordId },
        { $set: { status: RecordStatusEnhanced.NEEDS_REVIEW } },
      );
    }

    await this.closeReview(log, interpretation, {
      reviewStatus: AiReviewStatus.ASSIGNED,
      reviewAction: 'escalated',
      notes,
      reviewer,
      at: now,
    });
    await this.auditLogService.record({
      actorId: reviewer.id,
      action: AuditAction.ADMIN_AI_OUTPUT_ESCALATE,
      targetType: 'AIInteractionLog',
      targetId: log.id,
      metadata: { service: log.service, withdrawn: !!interpretation },
    });
    await this.notifications.notifyAdmins({
      trigger: 'ai_output_escalated',
      title: 'AI output sent to doctor review',
      message: 'A flagged AI output was blocked and needs a clinician to review it.',
      lockScreenText: 'An AI output needs clinician review',
      actionLabel: 'Review',
      actionRoute: '/admin/ai-monitoring',
    });
    return (await this.toResponses([log]))[0];
  }

  /** The report summary a Report Explainer log produced, if any. */
  private async interpretationFor(
    log: AIInteractionLogDocument,
  ): Promise<ReportInterpretationDocument | null> {
    const id = log.outcome?.['interpretationId'];
    if (log.service !== AiService.REPORT_INTERPRETER || typeof id !== 'string') return null;
    return Types.ObjectId.isValid(id) ? this.interpretationModel.findById(id).exec() : null;
  }

  /** Records the decision on this log and on any other open flag for the same summary. */
  private async closeReview(
    log: AIInteractionLogDocument,
    interpretation: ReportInterpretationDocument | null,
    decision: {
      reviewStatus: AiReviewStatus;
      reviewAction: 'approved' | 'escalated';
      notes?: string;
      reviewer: AiReviewer;
      at: Date;
    },
  ): Promise<void> {
    const update = {
      reviewStatus: decision.reviewStatus,
      reviewAction: decision.reviewAction,
      reviewedAt: decision.at,
      reviewedBy: decision.reviewer.email,
      ...(decision.notes?.trim() && { resolutionNotes: decision.notes.trim() }),
    };
    log.set(update);
    await log.save();
    if (interpretation) {
      await this.logModel.updateMany(
        {
          _id: { $ne: log._id },
          flagged: true,
          reviewStatus: { $in: PENDING_REVIEW },
          'outcome.interpretationId': interpretation.id,
        },
        { $set: update },
      );
    }
  }

  private async getFlaggedLogOrThrow(id: string): Promise<AIInteractionLogDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('AI interaction log not found');
    }
    const log = await this.logModel.findOne({ _id: id, flagged: true });
    if (!log) {
      throw new NotFoundException('Escalated AI interaction log not found');
    }
    return log;
  }

  /** Adds each report summary's release status (held / released / escalated). */
  private async toResponses(logs: AIInteractionLogDocument[]): Promise<AdminAiLogResponseDto[]> {
    const interpretationIds = logs
      .map((l) => l.outcome?.['interpretationId'])
      .filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id));
    const interpretations = interpretationIds.length
      ? await this.interpretationModel
          .find({ _id: { $in: interpretationIds } })
          .select('releaseStatus')
          .lean()
          .exec()
      : [];
    const releaseById = new Map(
      interpretations.map((i) => [
        i._id.toString(),
        i.releaseStatus ?? ReportReleaseStatus.RELEASED,
      ]),
    );
    return logs.map((log) => this.toResponse(log, releaseById));
  }

  private toResponse(
    log: AIInteractionLogDocument,
    releaseById: Map<string, ReportReleaseStatus>,
  ): AdminAiLogResponseDto {
    const interpretationId = log.outcome?.['interpretationId'];
    return {
      id: log.id,
      userId: log.userId.toString(),
      service: log.service,
      source: log.source,
      input: log.input,
      outcome: log.outcome,
      latencyMs: log.latencyMs,
      flagged: log.flagged,
      reviewStatus: log.reviewStatus,
      assignedTo: log.assignedTo?.toString(),
      resolutionNotes: log.resolutionNotes,
      reviewAction: log.reviewAction,
      reviewedAt: log.reviewedAt?.toISOString(),
      reviewedBy: log.reviewedBy,
      surfaceKey: log.surfaceKey,
      promptVersion: log.promptVersion,
      releaseStatus:
        typeof interpretationId === 'string' ? releaseById.get(interpretationId) : undefined,
      createdAt: (log.createdAt ?? new Date(0)).toISOString(),
    };
  }
}
