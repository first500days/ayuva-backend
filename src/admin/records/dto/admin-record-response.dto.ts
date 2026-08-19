import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminRecordResponseDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  patientId: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  patientName: string;

  @ApiPropertyOptional({ enum: ['blood', 'imaging', 'prescription', 'discharge', 'ecg', 'consultation'] })
  type: string;

  @ApiPropertyOptional({ example: 'blood_test.pdf' })
  originalFileName: string;

  @ApiPropertyOptional({ example: '2026-08-01T10:00:00.000Z' })
  uploadedAt: string;

  @ApiPropertyOptional({ enum: ['uploaded', 'queued', 'processing', 'interpreted', 'failed', 'needs_review', 'archived'] })
  status: string;

  @ApiPropertyOptional({ example: 'processing' })
  aiStatus?: string;
}
