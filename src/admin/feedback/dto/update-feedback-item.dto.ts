import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { FeedbackStatus } from '../../../core/feedback/schemas/feedback-item.schema';

// PATCH /admin/feedback/:id (FR-17.1 status, FR-17.4 ownership).
export class UpdateFeedbackItemDto {
  @ApiPropertyOptional({ enum: FeedbackStatus })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({
    description: 'Admin User id to assign this ticket to',
  })
  @IsOptional()
  @IsMongoId()
  assignedTo?: string;
}
