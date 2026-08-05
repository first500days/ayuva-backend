import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicationLogStatus } from '../schemas/medication-log.schema';

export class MedicationTodayItemDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  medicationId: string;

  @ApiProperty({ example: 'Amlodipine' })
  name: string;

  @ApiProperty({ example: '5 mg' })
  dosage: string;

  @ApiProperty({ example: 'Once daily · morning' })
  frequency: string;

  @ApiPropertyOptional({
    example: '08:00',
    nullable: true,
    description: 'null for "as needed" medications',
  })
  scheduleTime: string | null;

  @ApiPropertyOptional({ nullable: true })
  scheduledAt: string | null;

  @ApiProperty({ enum: MedicationLogStatus })
  status: MedicationLogStatus;

  @ApiProperty({
    description:
      '"Mark taken" should be shown now — due time has passed and no action taken yet',
  })
  isActionable: boolean;
}

export class MedicationAdherenceDto {
  @ApiProperty({ example: 1 })
  takenCount: number;

  @ApiProperty({ example: 3 })
  totalCount: number;

  @ApiProperty({ example: 33 })
  percent: number;
}

export class MedicationsTodayResponseDto {
  @ApiProperty({ type: [MedicationTodayItemDto] })
  items: MedicationTodayItemDto[];

  @ApiProperty({ type: MedicationAdherenceDto })
  adherence: MedicationAdherenceDto;
}
