import { Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AIInteractionLog,
  AIInteractionLogDocument,
  AiService,
} from './schemas/ai-interaction-log.schema';
import { AiSource } from '../common/ai-source.enum';
import {
  estimateTokens,
  guardrailHits,
  routeModel,
  type Routing,
} from '../common/ai-usage';
import {
  AiSurfaceConfig,
  AiSurfaceConfigDocument,
} from '../../admin/ai-control/schemas/ai-surface-config.schema';

export interface RecordAiInteractionParams {
  userId: string;
  service: AiService;
  input: Record<string, unknown>;
  outcome: Record<string, unknown>;
  latencyMs: number;
  source: AiSource;
  flagged?: boolean;
  surfaceKey?: string;
  promptVersion?: string;
}

/** The AI Control surface whose model settings a service runs under. */
export const SERVICE_SURFACE: Partial<Record<AiService, string>> = {
  [AiService.SYMPTOM_NAV]: 'symptom_triage',
  [AiService.REPORT_INTERPRETER]: 'report_interpreter',
  [AiService.ASSISTANT]: 'appointment_discovery',
};

const SURFACE_CACHE_MS = 30_000;

/**
 * Shared write path for every AI submodule (TRD §5.1 step 4, §5.4) — written
 * synchronously before the response returns, regardless of mock or real source.
 * Each row also carries its usage: estimated tokens, the guardrails the answer
 * touched, and the Gemini model the surface's balancing rule picks.
 */
@Injectable()
export class AiInteractionLogService {
  private surfaces?: {
    at: number;
    byKey: Map<string, { model: string; routing: Routing }>;
  };

  constructor(
    @InjectModel(AIInteractionLog.name)
    private readonly logModel: Model<AIInteractionLogDocument>,
    // Optional for hand-built test modules.
    @Optional()
    @InjectModel(AiSurfaceConfig.name)
    private readonly surfaceModel?: Model<AiSurfaceConfigDocument>,
  ) {}

  async record(params: RecordAiInteractionParams): Promise<void> {
    const promptTokens = estimateTokens(params.input);
    const outputTokens = estimateTokens(params.outcome);
    const guardrails = guardrailHits(params.outcome).map((h) => h.path);
    const surfaceKey = params.surfaceKey ?? SERVICE_SURFACE[params.service];
    const surface = surfaceKey ? await this.surface(surfaceKey) : null;
    const route = surface
      ? routeModel({
          routing: surface.routing,
          model: surface.model,
          promptTokens,
          guardrails: guardrails.length,
        })
      : null;
    await this.logModel.create({
      userId: new Types.ObjectId(params.userId),
      service: params.service,
      input: params.input,
      outcome: params.outcome,
      latencyMs: params.latencyMs,
      source: params.source,
      flagged: params.flagged ?? false,
      surfaceKey: params.surfaceKey,
      promptVersion: params.promptVersion,
      promptTokens,
      outputTokens,
      guardrails: guardrails.length ? guardrails : undefined,
      routedModel: route?.model,
      routeReason: route?.reason,
    });
  }

  private async surface(key: string) {
    if (!this.surfaceModel) return null;
    if (!this.surfaces || Date.now() - this.surfaces.at > SURFACE_CACHE_MS) {
      try {
        const rows = await this.surfaceModel
          .find()
          .select('surfaceKey model routing')
          .lean()
          .exec();
        this.surfaces = {
          at: Date.now(),
          byKey: new Map(
            rows.map((r) => [
              r.surfaceKey,
              { model: r.model, routing: (r.routing ?? 'fixed') as Routing },
            ]),
          ),
        };
      } catch {
        return null;
      }
    }
    return this.surfaces.byKey.get(key) ?? null;
  }
}
