import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { MedicalRecordType } from '../schemas/medical-record.schema';

export class QueryRecordsDto {
  @ApiPropertyOptional({ enum: MedicalRecordType })
  @IsOptional()
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;
}
