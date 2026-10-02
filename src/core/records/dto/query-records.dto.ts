import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  MedicalRecordKind,
  MedicalRecordType,
  normalizeRecordType,
} from '../schemas/medical-record.schema';

export class QueryRecordsDto {
  @ApiPropertyOptional({ enum: MedicalRecordType })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeRecordType(value))
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;

  @ApiPropertyOptional({
    description: 'Free-text search over name, tags and provider (U08)',
    example: 'lipid',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ example: 'cardiology' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @ApiPropertyOptional({ enum: MedicalRecordKind })
  @IsOptional()
  @IsEnum(MedicalRecordKind)
  kind?: MedicalRecordKind;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Clinical date from (inclusive)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
    description: 'Clinical date to (inclusive)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
