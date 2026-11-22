import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  LIS_DEPARTMENTS,
  LIS_ENTRY_KINDS,
  LIS_PRIORITIES,
  LIS_REJECT_REASONS,
  LIS_SPECIMENS,
} from '../schemas/lis-sample.schema';
import type { LisEntryKind } from '../schemas/lis-sample.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RequestLisDto {
  @ApiPropertyOptional({ description: 'Inpatient admission' })
  @IsOptional()
  @IsMongoId()
  admissionId?: string;
  @ApiPropertyOptional({ description: 'Emergency visit' })
  @IsOptional()
  @IsMongoId()
  erVisitId?: string;
  @ApiPropertyOptional({ description: 'Name-only patients (OPD / day care)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(130) age?: number;
  @ApiPropertyOptional({ enum: ['female', 'male', 'other'] })
  @IsOptional()
  @IsIn(['female', 'male', 'other'])
  gender?: string;
  @ApiPropertyOptional({ example: 'OPD 3' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  location?: string;

  @ApiProperty({ enum: LIS_DEPARTMENTS })
  @IsIn(LIS_DEPARTMENTS)
  department: string;
  @ApiProperty({ enum: LIS_SPECIMENS }) @IsIn(LIS_SPECIMENS) specimen: string;
  @ApiPropertyOptional({ example: 'EDTA (lavender)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  container?: string;

  @ApiProperty({ type: [String], example: ['CBC', 'ESR'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  tests: string[];

  @ApiPropertyOptional({ enum: LIS_PRIORITIES })
  @IsOptional()
  @IsIn(LIS_PRIORITIES)
  priority?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  clinicalNotes?: string;
}

export class LisBarcodeDto {
  @ApiPropertyOptional({ description: 'Tube label scanned now' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  barcode?: string;
}

export class LisRejectDto {
  @ApiProperty({ enum: LIS_REJECT_REASONS })
  @IsIn(LIS_REJECT_REASONS)
  reason: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
  @ApiPropertyOptional({
    description: 'Ask the ward for a new sample (default true)',
  })
  @IsOptional()
  @IsBoolean()
  recollect?: boolean;
}

export class LisCancelDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}

export class LisEntryDto {
  @ApiProperty({ enum: LIS_ENTRY_KINDS })
  @IsIn(LIS_ENTRY_KINDS)
  kind: LisEntryKind;

  @ApiProperty({
    example:
      'Gram stain: Gram-positive cocci in clusters. Culture in progress.',
  })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(8000)
  text: string;

  @ApiPropertyOptional({
    description: 'Life-threatening — alerts the requesting clinician',
  })
  @IsOptional()
  @IsBoolean()
  critical?: boolean;
}

export class LisQueryDto {
  @ApiPropertyOptional({
    description:
      'requested | collected | in_lab | resulted | verified | rejected | cancelled | open | all',
  })
  @IsOptional()
  @IsIn([
    'requested',
    'collected',
    'in_lab',
    'resulted',
    'verified',
    'rejected',
    'cancelled',
    'open',
    'all',
  ])
  view?: string;
  @ApiPropertyOptional({ enum: LIS_DEPARTMENTS })
  @IsOptional()
  @IsIn(LIS_DEPARTMENTS)
  department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}
