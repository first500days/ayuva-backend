import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  MedicalRecordKind,
  MedicalRecordType,
  normalizeRecordType,
} from '../schemas/medical-record.schema';

/**
 * Multipart fields arrive as strings, so tags may be a comma-separated string
 * or a repeated field. Either way the result is trimmed, lower-cased, de-duped.
 */
export function toTagList(value: unknown): unknown {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : value;
  if (!Array.isArray(raw)) return raw;
  return [
    ...new Set(
      raw
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export class UploadRecordDto {
  @ApiPropertyOptional({
    enum: MedicalRecordType,
    description:
      'Manual override — otherwise auto-categorised from filename/mimetype (FR-8.3). Legacy values (blood, imaging, ecg, consultation) are mapped to their folder.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeRecordType(value))
  @IsEnum(MedicalRecordType)
  type?: MedicalRecordType;

  @ApiPropertyOptional({
    enum: MedicalRecordKind,
    description:
      'original (default), simplification (U09 saved explanation) or visit_summary (U07 summary PDF)',
  })
  @IsOptional()
  @IsEnum(MedicalRecordKind)
  kind?: MedicalRecordKind;

  @ApiPropertyOptional({
    description: 'Source record — required for a simplification',
  })
  @IsOptional()
  @IsMongoId()
  derivedFromRecordId?: string;

  @ApiPropertyOptional({
    description: 'Appointment to attach to — used by the visit summary',
  })
  @IsOptional()
  @IsMongoId()
  appointmentId?: string;

  @ApiPropertyOptional({ example: 'Dr. Mehta' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerName?: string;

  @ApiPropertyOptional({
    example: '2026-07-14',
    description: 'Clinical date of the document',
  })
  @IsOptional()
  @IsDateString()
  recordDate?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['cardiology', '2026'],
    description: 'Comma-separated or repeated',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toTagList(value))
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
