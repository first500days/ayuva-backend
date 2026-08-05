import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MedicalRecordType } from '../../../core/records/schemas/medical-record.schema';
import { ReportAiStatus } from '../../../ai/report-interpreter/schemas/report-interpretation.schema';

export class QueryAdminReportsDto {
  @ApiPropertyOptional({
    enum: ReportAiStatus,
    description:
      'A record with no ReportInterpretation yet is treated as "queued" (FR-16.1)',
  })
  @IsOptional()
  @IsEnum(ReportAiStatus)
  status?: ReportAiStatus;

  @ApiPropertyOptional({ enum: MedicalRecordType })
  @IsOptional()
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;
}
