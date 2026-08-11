import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AIInteractionLog,
  AIInteractionLogDocument,
  AiService,
} from './schemas/ai-interaction-log.schema';
import { AiSource } from '../common/ai-source.enum';

export interface RecordAiInteractionParams {
  userId: string;
  service: AiService;
  input: Record<string, unknown>;
  outcome: Record<string, unknown>;
  latencyMs: number;
  source: AiSource;
  flagged?: boolean;
}

/**
 * Shared write path for every AI submodule (TRD §5.1 step 4, §5.4) — written
 * synchronously before the response returns, regardless of mock or real source.
 */
@Injectable()
export class AiInteractionLogService {
  constructor(
    @InjectModel(AIInteractionLog.name)
    private readonly logModel: Model<AIInteractionLogDocument>,
  ) {}

  async record(params: RecordAiInteractionParams): Promise<void> {
    await this.logModel.create({
      userId: new Types.ObjectId(params.userId),
      service: params.service,
      input: params.input,
      outcome: params.outcome,
      latencyMs: params.latencyMs,
      source: params.source,
      flagged: params.flagged ?? false,
    });
  }
}
