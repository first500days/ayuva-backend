import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackType,
} from '../../../core/feedback/schemas/feedback-item.schema';
import { ComplianceEscalationResponseDto } from './compliance-escalation.dto';

export class AdminFeedbackResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  reporterId: string;

  @ApiProperty({ example: 'Amara Okafor' })
  reporterName: string;

  @ApiProperty({ enum: FeedbackType })
  type: FeedbackType;

  @ApiProperty({ example: 'Sync issue' })
  title: string;

  @ApiProperty({ example: "BP log didn't sync after re-opening the app." })
  description: string;

  @ApiProperty({ enum: FeedbackStatus })
  status: FeedbackStatus;

  @ApiPropertyOptional({ enum: FeedbackPriority })
  priority?: FeedbackPriority;

  @ApiPropertyOptional({ enum: FeedbackCategory })
  category?: FeedbackCategory;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7ba' })
  assignedTo?: string;

  @ApiProperty({ example: '2026-08-02T10:00:00.000Z' })
  createdAt: string;

  @ApiPropertyOptional({
    type: ComplianceEscalationResponseDto,
    description: 'Set once the case was escalated to the legal and medical risk teams',
  })
  compliance?: ComplianceEscalationResponseDto;
}
