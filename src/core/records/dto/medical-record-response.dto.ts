import type { DocumentDetection } from '../document-detect';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MedicalRecordKind,
  MedicalRecordType,
} from '../schemas/medical-record.schema';

export class MedicalRecordResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({
    example: 'Lipid Profile',
    description: 'What the document is. Never the uploaded file name.',
  })
  title: string;

  @ApiPropertyOptional({ example: 'MRI Brain' })
  procedureType?: string;

  @ApiPropertyOptional({ example: 'Dr Rakesh Sharma' })
  attendingPhysician?: string;

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

  @ApiProperty({
    enum: ['uploaded', 'provider'],
    description:
      'uploaded: the patient filed it; provider: a lab or clinic delivered it. ' +
      'providerName alone is not enough — a patient upload names the lab on the report.',
  })
  source: 'uploaded' | 'provider';

  @ApiPropertyOptional({
    description:
      'Upload only: the folder, clinical date and provider read from the document ' +
      '(its text, or failing that its file name), each with where it came from. ' +
      'Rule-based; the patient confirms or corrects them.',
    example: {
      textRead: true,
      type: { value: 'lab_report', from: 'text' },
      recordDate: { value: '2026-10-12', from: 'text' },
      providerName: { value: 'Thyrocare', from: 'text' },
    },
  })
  detected?: DocumentDetection;

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
