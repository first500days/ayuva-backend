import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({
    type: [AiServiceUsageDto],
    description:
      'Usage-by-service breakdown, zeroed per known service until Phase 3 has data (FR-15.2)',
  })
  byService: AiServiceUsageDto[];
}
