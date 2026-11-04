import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ARRIVAL_MODES, ER_DISPOSITIONS } from '../schemas/er-visit.schema';
import type { ErDisposition } from '../schemas/er-visit.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class VitalsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  hr?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(320)
  sbp?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(250)
  dbp?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(80) rr?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  spo2?: number;
  @ApiPropertyOptional({ description: '°C' })
  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(45)
  temp?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(3) @Max(15) gcs?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10) pain?: number;
  @ApiPropertyOptional({ description: 'mg/dL' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2000)
  glucose?: number;
}

export class MlcDto {
  @ApiProperty() @IsBoolean() isMlc: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  mlcNo?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  policeStation?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() informedAt?: string;
}

export class TriageDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  level: number;
  @ApiPropertyOptional({ type: VitalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => VitalsDto)
  vitals?: VitalsDto;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() unresponsive?: boolean;
  @ApiPropertyOptional({
    description: 'Required when less urgent than the vital-sign suggestion',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  overrideReason?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RegisterErDto {
  @ApiPropertyOptional({
    description: 'Leave empty with unidentified=true for an unknown patient',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  patientName?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() unidentified?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(130) age?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ageApprox?: boolean;
  @ApiPropertyOptional({ enum: ['female', 'male', 'other', 'unknown'] })
  @IsOptional()
  @IsIn(['female', 'male', 'other', 'unknown'])
  gender?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  broughtBy?: string;

  @ApiPropertyOptional({ enum: ARRIVAL_MODES })
  @IsOptional()
  @IsIn(ARRIVAL_MODES)
  arrivalMode?: string;
  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @IsISO8601()
  arrivedAt?: string;

  @ApiProperty({ example: 'Chest pain for 1 hour' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  complaint: string;

  @ApiPropertyOptional({ type: MlcDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MlcDto)
  mlc?: MlcDto;

  @ApiPropertyOptional({
    type: TriageDto,
    description: 'Triage at the door (needs er.triage)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TriageDto)
  triage?: TriageDto;
}

export class UpdateErPatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(130) age?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ageApprox?: boolean;
  @ApiPropertyOptional({ enum: ['female', 'male', 'other', 'unknown'] })
  @IsOptional()
  @IsIn(['female', 'male', 'other', 'unknown'])
  gender?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  broughtBy?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  complaint?: string;
  @ApiPropertyOptional({ type: MlcDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MlcDto)
  mlc?: MlcDto;
}

export class AssignErDto {
  @ApiPropertyOptional({
    description: 'Doctor taking the patient (default: you)',
  })
  @IsOptional()
  @IsMongoId()
  doctorMemberId?: string;
  @ApiPropertyOptional({ example: 'Resus bay 1' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  area?: string;
}

export class DisposeErDto {
  @ApiProperty({ enum: ER_DISPOSITIONS })
  @IsIn(ER_DISPOSITIONS)
  type: ErDisposition;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  referredTo?: string;
  @ApiPropertyOptional({
    description: 'The admission made for this patient (Inpatient & Wards)',
  })
  @IsOptional()
  @IsMongoId()
  admissionId?: string;
}

export class ErBoardQueryDto {
  @ApiPropertyOptional({
    description: 'Closed visits from the last N hours (default 24)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(720)
  closedHours?: number;
}
