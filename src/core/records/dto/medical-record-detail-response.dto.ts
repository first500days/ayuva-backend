import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportAiStatus } from '../../../ai/report-interpreter/schemas/report-interpretation.schema';
import { MedicalRecordResponseDto } from './medical-record-response.dto';

export class MedicalRecordDetailResponseDto extends MedicalRecordResponseDto {
  @ApiProperty({
    enum: ReportAiStatus,
    description:
      'Defaults to "queued" when no ReportInterpretation exists yet — honest state until AI Report Interpreter (Phase 3) runs against this record.',
  })
  aiStatus: ReportAiStatus;

  @ApiPropertyOptional({
    description: 'Plain-language summary, present once aiStatus is "interpreted"',
  })
  summaryText?: string;
}
