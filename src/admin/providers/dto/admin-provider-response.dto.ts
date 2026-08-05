import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProviderCategory,
  ProviderStatus,
  WorkingDay,
} from '../../../core/providers/schemas/provider.schema';
import { ProviderLocationDto } from '../../../core/providers/dto/create-provider.dto';

export class AdminProviderScheduleResponseDto {
  @ApiProperty({ enum: WorkingDay, isArray: true })
  workingDays: WorkingDay[];

  @ApiProperty({ example: '09:00' })
  startTime: string;

  @ApiProperty({ example: '17:00' })
  endTime: string;

  @ApiProperty({ example: 30 })
  slotDurationMin: number;
}

export class AdminProviderBlockedDateResponseDto {
  @ApiProperty({ example: '2026-12-25' })
  date: string;

  @ApiProperty({ example: 'Public holiday' })
  reason: string;
}

export class AdminProviderResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Dr. Priya Menon' })
  name: string;

  @ApiProperty({ enum: ProviderCategory })
  type: ProviderCategory;

  @ApiProperty({ type: [String] })
  specialty: string[];

  @ApiProperty({ type: [ProviderLocationDto] })
  locations: ProviderLocationDto[];

  @ApiProperty({ type: [String] })
  languages: string[];

  @ApiProperty({ example: 4.9 })
  rating: number;

  @ApiProperty({ example: 30 })
  avgWaitMinutes: number;

  @ApiPropertyOptional({ example: 50 })
  consultationFee?: number;

  @ApiProperty({ enum: ProviderStatus })
  status: ProviderStatus;

  @ApiPropertyOptional({ example: 'https://cdn.ayuva.health/providers/p1.jpg' })
  profileImageUrl?: string;

  @ApiPropertyOptional({ type: AdminProviderScheduleResponseDto })
  schedule?: AdminProviderScheduleResponseDto;

  @ApiProperty({ type: [AdminProviderBlockedDateResponseDto] })
  blockedDates: AdminProviderBlockedDateResponseDto[];
}
