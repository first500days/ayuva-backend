import { ApiProperty } from '@nestjs/swagger';
import { MedicationLogStatus } from '../schemas/medication-log.schema';

export class MedicationLogResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  medicationId: string;

  @ApiProperty({ example: '2026-08-05T08:00:00.000Z' })
  scheduledAt: string;

  @ApiProperty({ enum: MedicationLogStatus })
  status: MedicationLogStatus;
}
