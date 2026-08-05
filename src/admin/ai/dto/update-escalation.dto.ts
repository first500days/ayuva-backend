import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { AiReviewStatus } from '../../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';

// PATCH /admin/ai/escalations/:id (FR-15.4 reviewer assignment/resolution, FR-15.5 mark-incorrect).
export class UpdateEscalationDto {
  @ApiPropertyOptional({ enum: AiReviewStatus })
  @IsOptional()
  @IsEnum(AiReviewStatus)
  reviewStatus?: AiReviewStatus;

  @ApiPropertyOptional({
    description: 'Reviewer (admin User) id to assign this escalation to',
  })
  @IsOptional()
  @IsMongoId()
  assignedTo?: string;

  @ApiPropertyOptional({
    example: 'False positive — risk classification was correct',
  })
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}
