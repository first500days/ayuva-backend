import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ComplianceEscalation,
  FeedbackCategory,
  FeedbackItem,
  FeedbackItemDocument,
  FeedbackPriority,
  FeedbackStatus,
} from '../../core/feedback/schemas/feedback-item.schema';
import {
  AIInteractionLog,
  AIInteractionLogDocument,
  AiService,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import {
  ReportInterpretation,
  ReportInterpretationDocument,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { AdminAiControlService } from '../ai-control/admin-ai-control.service';
import { SURFACE_KEY_BY_SERVICE } from '../ai-control/surface-versions.util';
import { AdminOperationsService } from '../operations/admin-operations.service';
import {
  IssueDomain,
  IssueSeverity,
} from '../operations/schemas/admin-issue.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import { AdminFeedbackService } from './admin-feedback.service';
import { AdminFeedbackResponseDto } from './dto/admin-feedback-response.dto';
import {
  EscalateComplianceDto,
  FeedbackAiContextItemDto,
} from './dto/compliance-escalation.dto';

const AI_CONTEXT_LIMIT = 10;

/**
 * "Escalate to Compliance" (patient feedback): hands a high-liability case to
 * the legal and medical risk teams. It records exactly which prompt version
 * produced the AI output in question and can pause that prompt for similar
 * documents until a full manual review lifts the hold in the AI Control Center.
 */
@Injectable()
export class AdminFeedbackComplianceService {
  constructor(
    @InjectModel(FeedbackItem.name)
    private readonly feedbackModel: Model<FeedbackItemDocument>,
    @InjectModel(AIInteractionLog.name)
    private readonly logModel: Model<AIInteractionLogDocument>,
    @InjectModel(ReportInterpretation.name)
    private readonly interpretationModel: Model<ReportInterpretationDocument>,
    private readonly feedback: AdminFeedbackService,
    private readonly aiControl: AdminAiControlService,
    private readonly operations: AdminOperationsService,
    private readonly auditLogService: AuditLogService,
    private readonly notifications: AppNotificationsService,
  ) {}

  /** The reporter's recent AI outputs, newest first, with the prompt version behind each. */
  async aiContext(feedbackId: string): Promise<FeedbackAiContextItemDto[]> {
    const item = await this.getFeedbackOrThrow(feedbackId);
    const logs = await this.logModel
      .find({
        userId: item.reporterId,
        service: { $in: Object.keys(SURFACE_KEY_BY_SERVICE) as AiService[] },
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();

    // Repeat views of one report summary log separately; list each output once.
    const seen = new Set<string>();
    const unique = logs.filter((l) => {
      const key = String(l.outcome?.['interpretationId'] ?? l.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return Promise.all(unique.slice(0, AI_CONTEXT_LIMIT).map((l) => this.describe(l)));
  }

  async escalate(
    feedbackId: string,
    dto: EscalateComplianceDto,
    actor: { id: string; email: string },
  ): Promise<AdminFeedbackResponseDto> {
    const item = await this.getFeedbackOrThrow(feedbackId);
    if (item.compliance) {
      throw new ConflictException(
        `Already escalated to compliance on ${item.compliance.escalatedAt.toISOString().slice(0, 10)}`,
      );
    }

    const log = await this.findSubjectLog(item, dto.aiLogId);
    const context = log ? await this.describe(log) : undefined;
    const reason = dto.reason?.trim() || undefined;

    // Hold the prompt for documents like this one until the review is done.
    let pausedRecordType: string | undefined;
    if (context?.surfaceKey && context.recordType && dto.pauseSimilar !== false) {
      await this.aiControl.pauseSurface(
        context.surfaceKey,
        {
          recordType: context.recordType,
          reason: `Compliance review of patient feedback ${item.id}`,
          caseRef: item.id,
        },
        actor,
      );
      pausedRecordType = context.recordType;
    }

    // Tracked on the Operations Desk; titles carry no patient details.
    const issue = await this.operations.create(
      {
        title: 'Compliance escalation: patient complaint about an AI output',
        description: [
          `Feedback ticket ${item.id} escalated to the legal and medical risk teams.`,
          context?.promptVersion
            ? `Prompt ${context.surfaceKey} ${context.promptVersion}${context.promptVersionInferred ? ' (reconstructed from prompt history)' : ''}.`
            : 'No AI output could be linked to this ticket.',
          pausedRecordType
            ? `Prompt paused for ${pausedRecordType} documents until the manual review is complete.`
            : 'Prompt not paused.',
        ].join(' '),
        domain: IssueDomain.AI,
        severity: IssueSeverity.CRITICAL,
        affectedEntity: { type: 'feedback', id: item.id, name: `Feedback ticket ${item.id.slice(-6)}` },
        evidence: [
          `feedback:${item.id}`,
          ...(context ? [`ai-log:${context.aiLogId}`] : []),
        ],
      },
      actor.id,
      actor.email,
    );

    const compliance: ComplianceEscalation = {
      escalatedAt: new Date(),
      escalatedBy: actor.email,
      reason,
      aiLogId: context ? new Types.ObjectId(context.aiLogId) : undefined,
      recordId: context?.recordId ? new Types.ObjectId(context.recordId) : undefined,
      recordType: context?.recordType,
      surfaceKey: context?.surfaceKey,
      promptVersion: context?.promptVersion,
      promptVersionInferred: context?.promptVersionInferred ?? false,
      pausedRecordType,
      issueId: (issue as { _id?: Types.ObjectId })._id,
    };
    item.compliance = compliance;
    item.status = FeedbackStatus.ESCALATED;
    item.priority = FeedbackPriority.CRITICAL;
    if (context) item.category = FeedbackCategory.AI;
    await item.save();

    await this.auditLogService.record({
      actorId: actor.id,
      action: AuditAction.ADMIN_FEEDBACK_COMPLIANCE_ESCALATE,
      targetType: 'FeedbackItem',
      targetId: item.id,
      metadata: {
        aiLogId: context?.aiLogId,
        surfaceKey: context?.surfaceKey,
        promptVersion: context?.promptVersion,
        promptVersionInferred: context?.promptVersionInferred,
        pausedRecordType,
        reason,
      },
    });
    await this.notifications.notifyAdmins({
      trigger: 'feedback_compliance_escalation',
      title: 'Escalated to compliance',
      message: 'A patient complaint about an AI output needs legal and clinical risk review.',
      lockScreenText: 'A case was escalated to compliance',
      actionLabel: 'Review',
      actionRoute: '/admin/feedback',
    });
    return this.feedback.findOne(item.id);
  }

  /** The chosen log (must belong to the reporter), else their latest AI output before the complaint. */
  private async findSubjectLog(
    item: FeedbackItemDocument,
    aiLogId?: string,
  ): Promise<AIInteractionLogDocument | null> {
    if (aiLogId) {
      const log = await this.logModel.findOne({ _id: aiLogId, userId: item.reporterId }).exec();
      if (!log) throw new NotFoundException('That AI interaction does not belong to this patient');
      return log;
    }
    return this.logModel
      .findOne({
        userId: item.reporterId,
        service: AiService.REPORT_INTERPRETER,
        ...(item.createdAt && { createdAt: { $lte: item.createdAt } }),
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * One AI output and the prompt behind it: the version logged with it, else
   * the one stored on its report summary, else reconstructed from history.
   */
  private async describe(log: AIInteractionLogDocument): Promise<FeedbackAiContextItemDto> {
    const surfaceKey = log.surfaceKey ?? SURFACE_KEY_BY_SERVICE[log.service];
    const interpretationId = log.outcome?.['interpretationId'];
    const interpretation =
      typeof interpretationId === 'string' && Types.ObjectId.isValid(interpretationId)
        ? await this.interpretationModel.findById(interpretationId).select('promptVersion recordId').lean().exec()
        : null;
    let promptVersion = log.promptVersion ?? interpretation?.promptVersion;
    let promptVersionInferred = false;
    if (!promptVersion && surfaceKey) {
      promptVersion = (await this.aiControl.versionLiveAt(surfaceKey, log.createdAt ?? new Date())).version;
      promptVersionInferred = true;
    }
    const recordType = log.input?.['recordType'];
    return {
      aiLogId: log.id,
      service: log.service,
      at: (log.createdAt ?? new Date(0)).toISOString(),
      recordType: typeof recordType === 'string' ? recordType : undefined,
      recordId: interpretation?.recordId?.toString(),
      surfaceKey,
      promptVersion,
      promptVersionInferred,
      flagged: log.flagged,
    };
  }

  private async getFeedbackOrThrow(id: string): Promise<FeedbackItemDocument> {
    const item = Types.ObjectId.isValid(id) ? await this.feedbackModel.findById(id).exec() : null;
    if (!item) throw new NotFoundException('Feedback item not found');
    return item;
  }
}
