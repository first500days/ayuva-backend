import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminPaymentResponseDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  patientId: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7ba' })
  providerId: string;

  @ApiPropertyOptional({ example: 500 })
  amount: number;

  @ApiPropertyOptional({ example: 'INR' })
  currency: string;

  @ApiPropertyOptional({ example: 'UPI' })
  paymentMethod?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'] })
  status: string;

  @ApiPropertyOptional({ example: '2026-08-01T10:00:00.000Z' })
  paidAt?: string;

  @ApiPropertyOptional({ example: '2026-08-02T10:00:00.000Z' })
  refundedAt?: string;

  @ApiPropertyOptional({ example: 500 })
  refundAmount?: number;

  @ApiPropertyOptional({ example: 'Appointment cancelled' })
  refundReason?: string;
}
