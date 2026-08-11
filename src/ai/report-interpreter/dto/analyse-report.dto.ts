import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

// POST /report-interpreter/analyse (TRD §4.4, §5.3).
export class AnalyseReportDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  @IsMongoId()
  recordId: string;
}
