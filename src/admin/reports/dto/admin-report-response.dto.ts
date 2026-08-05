import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalRecordType } from '../../../core/records/schemas/medical-record.schema';
import { ReportAiStatus } from '../../../ai/report-interpreter/schemas/report-interpretation.schema';

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
}
