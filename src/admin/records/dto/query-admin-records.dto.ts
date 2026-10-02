import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  MedicalRecordType,
  normalizeRecordType,
  RecordStatusEnhanced,
} from '../../../core/records/schemas/medical-record.schema';

export class QueryAdminRecordsDto {
  @ApiPropertyOptional({ example: 'lipid' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: MedicalRecordType })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeRecordType(value))
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;

  @ApiPropertyOptional({ enum: RecordStatusEnhanced })
  @IsOptional()
  @IsEnum(RecordStatusEnhanced)
  status?: RecordStatusEnhanced;
}
