import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({
    description: 'Provider profile the appointment is booked with (FR-7.1)',
  })
  @IsMongoId()
  providerId: string;

  @ApiProperty({ description: 'Selected AppointmentSlot (FR-7.2)' })
  @IsMongoId()
  slotId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  itemTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  visitType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preparation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cashback?: number;
}
