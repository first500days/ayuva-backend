import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ANAESTHESIA_TYPES,
  OT_PRIORITIES,
  OT_SIDES,
} from '../schemas/ot.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export const OT_ROOM_TYPES = [
  'general',
  'orthopaedic',
  'cardiac',
  'neuro',
  'obstetric',
  'ophthalmic',
  'minor',
] as const;

export class CreateOtRoomDto {
  @ApiProperty({ example: 'OT 1' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;
  @ApiPropertyOptional({ enum: OT_ROOM_TYPES })
  @IsOptional()
  @IsIn(OT_ROOM_TYPES)
  type?: string;
}

export class UpdateOtRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;
  @ApiPropertyOptional({ enum: OT_ROOM_TYPES })
  @IsOptional()
  @IsIn(OT_ROOM_TYPES)
  type?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class BookOtCaseDto {
  @ApiProperty() @IsMongoId() roomId: string;
  @ApiProperty() @IsISO8601() start: string;
  @ApiProperty() @IsInt() @Min(15) @Max(1440) durationMinutes: number;

  @ApiPropertyOptional()
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
  @ApiPropertyOptional({
    description: 'Inpatient admission the case belongs to',
  })
  @IsOptional()
  @IsMongoId()
  admissionId?: string;

  @ApiProperty({ example: 'Total knee replacement' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  procedure: string;
  @ApiPropertyOptional({ enum: OT_SIDES })
  @IsOptional()
  @IsIn(OT_SIDES)
  side?: string;
  @ApiPropertyOptional({ enum: OT_PRIORITIES })
  @IsOptional()
  @IsIn(OT_PRIORITIES)
  priority?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  department?: string;

  @ApiProperty() @IsMongoId() surgeonMemberId: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  anaesthetistMemberId?: string;
  @ApiPropertyOptional({ enum: ANAESTHESIA_TYPES })
  @IsOptional()
  @IsIn(ANAESTHESIA_TYPES)
  anaesthesia?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  assistants?: string[];
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Book even though a team member is off the duty roster',
  })
  @IsOptional()
  @IsBoolean()
  allowOffRoster?: boolean;
}

export class UpdateOtCaseDto extends PartialType(BookOtCaseDto) {}

export const OT_STAGES = [
  'scheduled',
  'pre_op',
  'in_theatre',
  'recovery',
  'completed',
  'cancelled',
  'postponed',
] as const;

export class OtStageDto {
  @ApiProperty({ enum: OT_STAGES })
  @IsIn(OT_STAGES)
  to: (typeof OT_STAGES)[number];
  @ApiPropertyOptional({ description: 'Required to cancel or postpone' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class OtPreOpTicksDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() consent?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() siteMarked?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() fasting?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() anaesthesiaCheck?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() bloodArranged?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() investigations?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() implantsReady?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() antibiotic?: boolean;
}

export class OtChecklistDto {
  @ApiPropertyOptional({ type: OtPreOpTicksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OtPreOpTicksDto)
  preOp?: OtPreOpTicksDto;
  @ApiPropertyOptional({ description: 'WHO Sign In done' })
  @IsOptional()
  @IsBoolean()
  signIn?: boolean;
  @ApiPropertyOptional({ description: 'WHO Time Out done' })
  @IsOptional()
  @IsBoolean()
  timeOut?: boolean;
  @ApiPropertyOptional({ description: 'WHO Sign Out done' })
  @IsOptional()
  @IsBoolean()
  signOut?: boolean;
}

export const OT_TIME_FIELDS = [
  'wheeledIn',
  'anaesthesiaStart',
  'incision',
  'closure',
  'wheeledOut',
  'recoveryIn',
  'recoveryOut',
] as const;

export class OtTimeDto {
  @ApiProperty({ enum: OT_TIME_FIELDS })
  @IsIn(OT_TIME_FIELDS)
  field: (typeof OT_TIME_FIELDS)[number];
  @ApiPropertyOptional({ description: 'Default now' })
  @IsOptional()
  @IsISO8601()
  at?: string;
}

export const OT_DISPOSITIONS = ['ward', 'icu', 'hdu', 'home', 'other'] as const;

export class OtPostOpDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  procedureDone: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  findings?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  complications?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20000)
  bloodLossMl?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  implants?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  specimens?: string;
  @ApiProperty({ enum: OT_DISPOSITIONS })
  @IsIn(OT_DISPOSITIONS)
  disposition: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  instructions?: string;
}

export class OtCasesQueryDto {
  @ApiProperty() @IsISO8601() from: string;
  @ApiProperty() @IsISO8601() to: string;
}

export class OtAvailabilityQueryDto {
  @ApiProperty({ example: '2026-11-05' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;
}
