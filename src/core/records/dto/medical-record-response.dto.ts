import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalRecordType } from '../schemas/medical-record.schema';

export class MedicalRecordResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Lipid panel — full.pdf' })
  title: string;

  @ApiProperty({ enum: MedicalRecordType })
  type: MedicalRecordType;

  @ApiProperty({ example: '2026-08-02T00:00:00.000Z' })
  uploadedAt: string;

  @ApiPropertyOptional({
    example: '64f0c8e2b1a2c3d4e5f6a7c0',
    description:
      'Appointment this record/interpretation was attached to, if any (FR-9.5)',
  })
  attachedAppointmentId?: string;
}
