import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /admin/feedback/:id/escalate-compliance */
export class EscalateComplianceDto {
  @ApiPropertyOptional({
    description:
      "The AI interaction the complaint is about; defaults to the reporter's latest report summary",
  })
  @IsOptional()
  @IsMongoId()
  aiLogId?: string;

  @ApiPropertyOptional({ example: 'Patient reports the ECG summary misread the PR interval' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Pause that prompt for similar documents until the manual review is complete',
  })
  @IsOptional()
  @IsBoolean()
  pauseSimilar?: boolean;
}

/** One AI output the reporter received — candidates for "which output is this about?". */
export class FeedbackAiContextItemDto {
  @ApiProperty() aiLogId: string;
  @ApiProperty({ example: 'reportInterpreter' }) service: string;
  @ApiProperty() at: string;
  @ApiPropertyOptional({ example: 'lab_report' }) recordType?: string;
  @ApiPropertyOptional() recordId?: string;
  @ApiPropertyOptional({ example: 'report_interpreter' }) surfaceKey?: string;
  @ApiPropertyOptional({ example: 'v2.1.4' }) promptVersion?: string;
  @ApiProperty({ description: 'Version reconstructed from the prompt history' })
  promptVersionInferred: boolean;
  @ApiProperty() flagged: boolean;
}

export class ComplianceEscalationResponseDto {
  @ApiProperty() escalatedAt: string;
  @ApiPropertyOptional() escalatedBy?: string;
  @ApiPropertyOptional() reason?: string;
  @ApiPropertyOptional() aiLogId?: string;
  @ApiPropertyOptional() recordType?: string;
  @ApiPropertyOptional() surfaceKey?: string;
  @ApiPropertyOptional({ example: 'v2.1.4' }) promptVersion?: string;
  @ApiProperty() promptVersionInferred: boolean;
  @ApiPropertyOptional({ example: 'lab_report' }) pausedRecordType?: string;
  @ApiPropertyOptional() issueId?: string;
}
