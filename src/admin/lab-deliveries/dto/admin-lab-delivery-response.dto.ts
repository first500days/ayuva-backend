import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LabDeliveryStatus, LabDeliveryMethod } from '../../../core/labs/schemas/lab-delivery-order.schema';

class LabDeliveryTestItemResponseDto {
  @ApiProperty()
  testCode: string;

  @ApiProperty()
  testName: string;

  @ApiPropertyOptional()
  category?: string;

  @ApiPropertyOptional()
  sampleType?: string;

  @ApiPropertyOptional()
  fastingRequired?: boolean;
}

class LabDeliveryAttemptResponseDto {
  @ApiProperty()
  attemptedAt: string;

  @ApiProperty({ enum: LabDeliveryMethod })
  method: LabDeliveryMethod;

  @ApiPropertyOptional()
  responseCode?: number;

  @ApiPropertyOptional()
  errorReason?: string;

  @ApiProperty()
  success: boolean;
}

export class AdminLabDeliveryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  labId: string;

  @ApiProperty()
  labName: string;

  @ApiProperty()
  patientId: string;

  @ApiProperty()
  patientName: string;

  @ApiPropertyOptional()
  appointmentId?: string;

  @ApiPropertyOptional()
  testId?: string;

  @ApiProperty({ type: [LabDeliveryTestItemResponseDto] })
  tests: LabDeliveryTestItemResponseDto[];

  @ApiProperty()
  orderId: string;

  @ApiProperty({ enum: LabDeliveryStatus })
  status: LabDeliveryStatus;

  @ApiPropertyOptional()
  collectedAt?: string;

  @ApiPropertyOptional()
  processedAt?: string;

  @ApiPropertyOptional()
  deliveredAt?: string;

  @ApiPropertyOptional()
  expectedDeliveryAt?: string;

  @ApiProperty({ enum: LabDeliveryMethod })
  deliveryMethod: LabDeliveryMethod;

  @ApiProperty()
  attempts: number;

  @ApiProperty({ type: [LabDeliveryAttemptResponseDto] })
  attemptHistory: LabDeliveryAttemptResponseDto[];

  @ApiPropertyOptional()
  errorReason?: string;

  @ApiPropertyOptional()
  webhookPayload?: Record<string, any>;

  @ApiPropertyOptional()
  labReportMetadata?: Record<string, any>;

  @ApiPropertyOptional()
  reportFileUrl?: string;

  @ApiPropertyOptional()
  reportFileName?: string;

  @ApiProperty()
  patientNotified: boolean;

  @ApiPropertyOptional()
  notifiedAt?: string;

  @ApiPropertyOptional()
  assignedTo?: string;

  @ApiProperty({ enum: ['normal', 'urgent', 'stat'] })
  priority: 'normal' | 'urgent' | 'stat';

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiPropertyOptional()
  turnaroundMinutes?: number;
}