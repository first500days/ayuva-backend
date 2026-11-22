import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiService } from '../../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';

export class AiServiceUsageDto {
  @ApiProperty({ enum: AiService })
  service: AiService;

  @ApiProperty({ example: 0 })
  count: number;
}

export class AdminAiOverviewResponseDto {
  @ApiProperty({ example: 0, description: 'Total logged AI prompts (FR-15.1)' })
  totalPrompts: number;

  @ApiProperty({ example: 0 })
  avgResponseTimeMs: number;

  @ApiProperty({
    example: 0,
    description:
      'Percentage of interactions not flagged for review — 0 with no data yet, never fabricated (FR-15.1)',
  })
  successRatePercent: number;

  @ApiProperty({ example: 0 })
  flaggedCount: number;

  @ApiProperty({ example: 0, description: 'Flagged items no reviewer has approved yet' })
  pendingReviewCount: number;

  @ApiProperty({
    type: [AiServiceUsageDto],
    description:
      'Usage-by-service breakdown, zeroed per known service until Phase 3 has data (FR-15.2)',
  })
  byService: AiServiceUsageDto[];

  @ApiPropertyOptional({
    type: Object,
    description:
      'Last 24 h: prompt vs output tokens (estimated while the engine is rule-based), calls that touched a guardrail, and split by routed Gemini model',
  })
  tokens24h?: {
    promptTokens: number;
    outputTokens: number;
    estimated: boolean;
    guardrailCalls: number;
    byModel: { model: string; calls: number; promptTokens: number; outputTokens: number }[];
  };
}
