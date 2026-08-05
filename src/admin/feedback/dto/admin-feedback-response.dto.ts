import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  FeedbackStatus,
  FeedbackType,
} from '../../../core/feedback/schemas/feedback-item.schema';

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

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7ba' })
  assignedTo?: string;

  @ApiProperty({ example: '2026-08-02T10:00:00.000Z' })
  createdAt: string;
}
