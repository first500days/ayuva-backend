import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsString, IsOptional } from 'class-validator';

export class RefundPaymentDto {
  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ example: 'Appointment cancelled by patient' })
  @IsOptional()
  @IsString()
  reason?: string;
}
