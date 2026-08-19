import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MedicalRecordType, RecordStatusEnhanced } from '../../../core/records/schemas/medical-record.schema';

export class QueryAdminRecordsDto {
  @ApiPropertyOptional({ example: 'blood' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: MedicalRecordType })
  @IsOptional()
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;

  @ApiPropertyOptional({ enum: RecordStatusEnhanced })
  @IsOptional()
  @IsEnum(RecordStatusEnhanced)
  status?: RecordStatusEnhanced;
}
