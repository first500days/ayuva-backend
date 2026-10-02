import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  MedicalRecordType,
  normalizeRecordType,
} from '../schemas/medical-record.schema';
import { toTagList } from './upload-record.dto';

/** U08 row menu: rename, move to another folder, tag, set provider/date. */
export class UpdateRecordDto {
  @ApiPropertyOptional({ example: 'Lipid panel — July' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({
    enum: MedicalRecordType,
    description: 'Move to another folder',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeRecordType(value))
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;

  @ApiPropertyOptional({
    type: [String],
    description: 'Replaces the tag list',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toTagList(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'Dr. Mehta' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerName?: string;

  @ApiPropertyOptional({ example: '2026-07-14' })
  @IsOptional()
  @IsDateString()
  recordDate?: string;
}
