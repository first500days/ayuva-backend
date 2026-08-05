import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum } from 'class-validator';
import { MedicationLogStatus } from '../schemas/medication-log.schema';

export class CreateMedicationLogDto {
  @ApiProperty({ example: '2026-08-05T08:00:00.000Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ enum: MedicationLogStatus })
  @IsEnum(MedicationLogStatus)
  status: MedicationLogStatus;
}
