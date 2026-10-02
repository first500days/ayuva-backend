import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MedicalRecordKind,
  MedicalRecordType,
} from '../schemas/medical-record.schema';

export class MedicalRecordResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: 'Lipid panel — full.pdf' })
  title: string;

  @ApiProperty({ enum: MedicalRecordType })
  type: MedicalRecordType;

  @ApiProperty({ enum: MedicalRecordKind })
  kind: MedicalRecordKind;

  @ApiProperty({ example: '2026-08-02T00:00:00.000Z' })
  uploadedAt: string;

  @ApiProperty({
    example: '2026-07-14T00:00:00.000Z',
    description:
      'Clinical date, falling back to uploadedAt — what the vault timeline sorts by',
  })
  recordDate: string;

  @ApiProperty({ type: [String], example: ['cardiology'] })
  tags: string[];

  @ApiPropertyOptional({ example: 'Dr. Mehta' })
  providerName?: string;

  @ApiPropertyOptional({
    description: 'Source record of a simplification or visit summary',
  })
  derivedFromRecordId?: string;

  @ApiPropertyOptional({
    example: '64f0c8e2b1a2c3d4e5f6a7c0',
    description:
      'Appointment this record/interpretation was attached to, if any (FR-9.5)',
  })
  attachedAppointmentId?: string;
}
