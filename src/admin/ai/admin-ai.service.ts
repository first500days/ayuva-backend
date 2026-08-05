import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AIInteractionLog,
  AIInteractionLogDocument,
  AiService,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import { QueryAiLogsDto } from './dto/query-ai-logs.dto';
import { UpdateEscalationDto } from './dto/update-escalation.dto';
import { AdminAiOverviewResponseDto } from './dto/admin-ai-overview-response.dto';
import { AdminAiLogResponseDto } from './dto/admin-ai-log-response.dto';

@Injectable()
export class AdminAiService {
  constructor(
    @InjectModel(AIInteractionLog.name)
    private readonly logModel: Model<AIInteractionLogDocument>,
  ) {}

  async getOverview(): Promise<AdminAiOverviewResponseDto> {
    const logs = await this.logModel.find({}).exec();

    const totalPrompts = logs.length;
    const flaggedCount = logs.filter((l) => l.flagged).length;
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
      byService,
    };
  }

  async getLogs(query: QueryAiLogsDto): Promise<AdminAiLogResponseDto[]> {
    const logs = await this.logModel
      .find(query.service ? { service: query.service } : {})
      .sort({ createdAt: -1 })
      .exec();
    return logs.map((l) => this.toResponse(l));
  }

  async getEscalations(): Promise<AdminAiLogResponseDto[]> {
    const logs = await this.logModel
      .find({ flagged: true })
      .sort({ createdAt: -1 })
      .exec();
    return logs.map((l) => this.toResponse(l));
  }

  async updateEscalation(
    id: string,
    dto: UpdateEscalationDto,
  ): Promise<AdminAiLogResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('AI interaction log not found');
    }
    const log = await this.logModel.findOne({ _id: id, flagged: true });
    if (!log) {
      throw new NotFoundException('Escalated AI interaction log not found');
    }

    if (dto.reviewStatus !== undefined) log.reviewStatus = dto.reviewStatus;
    if (dto.assignedTo !== undefined)
      log.assignedTo = new Types.ObjectId(dto.assignedTo);
    if (dto.resolutionNotes !== undefined)
      log.resolutionNotes = dto.resolutionNotes;

    await log.save();
    return this.toResponse(log);
  }

  private toResponse(log: AIInteractionLogDocument): AdminAiLogResponseDto {
    return {
      id: log.id,
      userId: log.userId.toString(),
      service: log.service,
      input: log.input,
      outcome: log.outcome,
      latencyMs: log.latencyMs,
      flagged: log.flagged,
      reviewStatus: log.reviewStatus,
      assignedTo: log.assignedTo?.toString(),
      resolutionNotes: log.resolutionNotes,
      createdAt: (log.createdAt ?? new Date(0)).toISOString(),
    };
  }
}
