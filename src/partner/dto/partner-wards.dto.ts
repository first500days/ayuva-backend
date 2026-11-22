import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { WardGender, BedStatus } from '../../core/hospital/schemas/ward.schema';

export class CreateWardDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floor?: string;

  @ApiPropertyOptional({ enum: WardGender })
  @IsOptional()
  @IsEnum(WardGender)
  genderPolicy?: WardGender;

  @ApiProperty()
  @IsInt()
  @Min(1)
  bedCount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bedPrefix?: string;
}

export class UpdateWardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floor?: string;

  @ApiPropertyOptional({ enum: WardGender })
  @IsOptional()
  @IsEnum(WardGender)
  genderPolicy?: WardGender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bedCapacity?: number;
}

class LayoutBedDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsNumber()
  x: number;

  @ApiProperty()
  @IsNumber()
  y: number;
}

export class SaveWardLayoutDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  cols: number;

  @ApiProperty({ type: [LayoutBedDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LayoutBedDto)
  beds: LayoutBedDto[];
}

export class AddBedsDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  count: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prefix?: string;
}

export class SetBedStatusDto {
  @ApiProperty({ enum: BedStatus })
  @IsEnum(BedStatus)
  status: BedStatus;
}

export class AdmissionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  wardId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

export class AdmitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  age?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty()
  @IsString()
  wardId: string;

  @ApiProperty()
  @IsString()
  bedId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attendingMemberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expectedDischargeAt?: string;
}

export class TransferAdmissionDto {
  @ApiProperty()
  @IsString()
  wardId: string;

  @ApiProperty()
  @IsString()
  bedId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  attendingMemberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DischargeAdmissionDto {
  @ApiProperty()
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sendSummary?: boolean;
}
