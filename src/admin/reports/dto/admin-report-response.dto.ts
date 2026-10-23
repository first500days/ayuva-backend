import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalRecordType } from '../../../core/records/schemas/medical-record.schema';
import {
  ReportAiStatus,
  ReportReleaseStatus,
} from '../../../ai/report-interpreter/schemas/report-interpretation.schema';

/** How a report's values were extracted (the "Processing Method" column). */
export type ProcessingMethod = 'ai_parsed' | 'ocr_extracted' | 'md_verified';

export class AdminReportResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  patientId: string;

  @ApiProperty({ example: 'Amara Okafor' })
  patientName: string;

  @ApiProperty({ enum: MedicalRecordType })
  type: MedicalRecordType;

  @ApiProperty({ example: '2026-08-02T00:00:00.000Z' })
  uploadedAt: string;

  @ApiProperty({
    enum: ReportAiStatus,
    description:
      'Defaults to "queued" when no ReportInterpretation exists yet (Phase 3 not built)',
  })
  aiStatus: ReportAiStatus;

  @ApiPropertyOptional()
  summaryText?: string;

  @ApiProperty({
    enum: ['ai_parsed', 'ocr_extracted', 'md_verified'],
    nullable: true,
    description: 'null until anything has been extracted from the document',
  })
  processingMethod: ProcessingMethod | null;

  @ApiPropertyOptional({ example: 'dr.rao@ayuva.health', description: 'Clinician who verified the values' })
  verifiedBy?: string;

  @ApiPropertyOptional()
  verifiedAt?: string;

  @ApiPropertyOptional({ enum: ReportReleaseStatus })
  releaseStatus?: ReportReleaseStatus;

  @ApiPropertyOptional({ example: 'v2.1.4' })
  promptVersion?: string;
}
