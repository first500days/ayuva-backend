import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiService } from '../../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';

export class AdminAiLogResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  userId: string;

  @ApiProperty({ enum: AiService })
  service: AiService;

  @ApiProperty({ type: Object })
  input: Record<string, unknown>;

  @ApiProperty({ type: Object })
  outcome: Record<string, unknown>;

  @ApiProperty({ example: 1240 })
  latencyMs: number;

  @ApiProperty({ example: false })
  flagged: boolean;

  @ApiProperty({ example: 'none' })
  reviewStatus: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7ba' })
  assignedTo?: string;

  @ApiPropertyOptional({
    example: 'False positive — risk classification was correct',
  })
  resolutionNotes?: string;

  @ApiProperty({ example: '2026-08-02T10:00:00.000Z' })
  createdAt: string;
}
