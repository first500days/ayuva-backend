import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
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
import { PriorAuthStatus } from '../schemas/prior-auth.schema';

export class PriorAuthQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() referralId?: string;
  @ApiPropertyOptional({ enum: PriorAuthStatus })
  @IsOptional()
  @IsEnum(PriorAuthStatus)
  status?: PriorAuthStatus;
}

export class PriorAuthProcedureDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name: string;
  @ApiPropertyOptional({ description: "The insurer's package code" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  packageCode?: string;
}

export class UpdatePriorAuthDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'ICD-11 codes from the catalogue',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  diagnosisCodes?: string[];

  @ApiPropertyOptional({ type: [PriorAuthProcedureDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PriorAuthProcedureDto)
  procedures?: PriorAuthProcedureDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  payer?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tpaName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  policyNumber?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalSummary?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  stayDays?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000_000)
  estimatedAmount?: number;
}

export class ApprovePriorAuthDto {
  @ApiProperty({
    description:
      'The approver checked the codes, amounts and summary against the notes',
  })
  @IsBoolean()
  attest: boolean;
}

export class SubmitPriorAuthDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  payerRef?: string;
}

export class PriorAuthDecisionDto {
  @ApiProperty({ enum: ['approved', 'query', 'rejected'] })
  @IsIn(['approved', 'query', 'rejected'])
  decision: 'approved' | 'query' | 'rejected';
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  payerRef?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountApproved?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CancelPriorAuthDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
