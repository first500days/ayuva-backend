import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AiService } from '../../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import { ReportReleaseStatus } from '../../../ai/report-interpreter/schemas/report-interpretation.schema';
import { AiSource } from '../../../ai/common/ai-source.enum';

export class AdminAiLogResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  userId: string;

  @ApiProperty({ enum: AiService })
  service: AiService;

  @ApiProperty({
    enum: AiSource,
    example: AiSource.MOCK,
    description:
      'mock until the AI-owning team\'s real service is dropped in (TRD §6)',
  })
  source: AiSource;

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

  @ApiPropertyOptional({ enum: ['approved', 'escalated'] })
  reviewAction?: 'approved' | 'escalated';

  @ApiPropertyOptional({ example: '2026-08-02T11:00:00.000Z' })
  reviewedAt?: string;

  @ApiPropertyOptional({ example: 'reviewer@ayuva.health' })
  reviewedBy?: string;

  @ApiPropertyOptional({ example: 'report_interpreter' })
  surfaceKey?: string;

  @ApiPropertyOptional({ example: 'v2.1.5', description: 'Prompt version in force when this ran' })
  promptVersion?: string;

  @ApiPropertyOptional({
    enum: ReportReleaseStatus,
    description: 'Report Explainer only: whether the patient can see the summary',
  })
  releaseStatus?: ReportReleaseStatus;

  @ApiProperty({ example: '2026-08-02T10:00:00.000Z' })
  createdAt: string;
}

/** Body for POST /admin/ai/escalations/:id/approve and /escalate. */
export class AiReviewDecisionDto {
  @ApiPropertyOptional({ example: 'Values checked against the original report' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
