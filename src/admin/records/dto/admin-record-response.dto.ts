import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalRecordType } from '../../../core/records/schemas/medical-record.schema';

/** The "Consent Token" badge: whether health-data consent covers this record. */
export class AdminRecordConsentDto {
  @ApiProperty({ enum: ['verified', 'missing'] })
  status: 'verified' | 'missing';

  @ApiProperty({
    enum: ['ingestion', 'reconsent', 'account', 'none'],
    description: 'ingestion/reconsent: token on the record; account: older record covered by the account consent',
  })
  source: 'ingestion' | 'reconsent' | 'account' | 'none';

  @ApiProperty({ example: 'Consent 2026-01-01 attached at upload' })
  detail: string;

  @ApiPropertyOptional({ example: 'CT-3F9A1C07B2' })
  tokenId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  version?: string;

  @ApiPropertyOptional() acceptedAt?: string;
  @ApiPropertyOptional() capturedAt?: string;
}

export class AdminRecordResponseDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  patientId: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  patientName: string;

  @ApiPropertyOptional({ enum: MedicalRecordType })
  type: string;

  @ApiPropertyOptional({
    example: 'AYUVA-IMG-2FBC.jpg',
    description: 'System file name — the patient device filename is never exposed here',
  })
  fileName: string;

  @ApiPropertyOptional({ example: '2026-08-01T10:00:00.000Z' })
  uploadedAt: string;

  @ApiPropertyOptional({ enum: ['uploaded', 'queued', 'processing', 'interpreted', 'failed', 'needs_review', 'archived'] })
  status: string;

  @ApiPropertyOptional({ example: 'processing' })
  aiStatus?: string;

  @ApiProperty({ type: AdminRecordConsentDto })
  consent: AdminRecordConsentDto;

  @ApiProperty({ description: 'No AI processing or admin file access until consent is in place' })
  locked: boolean;
}
