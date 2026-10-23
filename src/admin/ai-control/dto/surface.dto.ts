import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MedicalRecordType } from '../../../core/records/schemas/medical-record.schema';
import { ALL_RECORD_TYPES } from '../schemas/ai-surface-config.schema';

const PAUSABLE_RECORD_TYPES = [ALL_RECORD_TYPES, ...Object.values(MedicalRecordType)];

/** PUT /admin/ai-control/surfaces/:surfaceKey — the version is server-owned. */
export class UpdateSurfaceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: 'gemini-1.5-pro' }) @IsOptional() @IsString() @MaxLength(80)
  model?: string;

  @ApiPropertyOptional({ example: 0.15 }) @IsOptional() @IsNumber() @Min(0) @Max(2)
  temperature?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(20000)
  systemPrompt?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  safetyGuards?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  fallbackResponses?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class RollbackSurfaceDto {
  @ApiPropertyOptional({ example: 'v2.1.5 misread reference ranges on live summaries' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PauseSurfaceDto {
  @ApiProperty({ enum: PAUSABLE_RECORD_TYPES, example: 'lab_report' })
  @IsIn(PAUSABLE_RECORD_TYPES)
  recordType: string;

  @ApiProperty({ example: 'Patient reported a misread ECG summary' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ResumeSurfaceDto {
  @ApiPropertyOptional({ enum: PAUSABLE_RECORD_TYPES, description: 'Omit to lift every hold' })
  @IsOptional()
  @IsIn(PAUSABLE_RECORD_TYPES)
  recordType?: string;
}
