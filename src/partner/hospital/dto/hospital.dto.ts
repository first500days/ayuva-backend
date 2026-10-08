import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
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
} from 'class-validator';
import { BedStatus } from '../schemas/ward.schema';
import { ClaimStatus } from '../schemas/insurance-claim.schema';

export const WARD_TYPES = [
  'general',
  'icu',
  'private',
  'semi_private',
  'emergency',
  'maternity',
  'paediatric',
] as const;

export class CreateWardDto {
  @ApiProperty({ example: 'General Ward A' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
  @ApiPropertyOptional({ enum: WARD_TYPES })
  @IsOptional()
  @IsIn(WARD_TYPES)
  type?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  floor?: string;
  @ApiProperty({ minimum: 1, maximum: 200 })
  @IsInt()
  @Min(1)
  @Max(200)
  bedCount: number;
  @ApiPropertyOptional({ example: 'A-', description: 'Bed label prefix' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bedPrefix?: string;
}

export class UpdateWardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
  @ApiPropertyOptional({ enum: WARD_TYPES })
  @IsOptional()
  @IsIn(WARD_TYPES)
  type?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  floor?: string;
}

export class AddBedsDto {
  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  count: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  prefix?: string;
}

export class SetBedStatusDto {
  @ApiProperty({
    enum: [
      BedStatus.AVAILABLE,
      BedStatus.CLEANING,
      BedStatus.MAINTENANCE,
      BedStatus.RESERVED,
    ],
  })
  @IsIn([
    BedStatus.AVAILABLE,
    BedStatus.CLEANING,
    BedStatus.MAINTENANCE,
    BedStatus.RESERVED,
  ])
  status: BedStatus;
}

export class AdmitDto {
  @ApiPropertyOptional({ description: 'Ayuva patient linked to this hospital' })
  @IsOptional()
  @IsMongoId()
  patientId?: string;
  @ApiPropertyOptional({ description: 'Required when no patientId (walk-in)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patientName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  patientPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(130) age?: number;
  @ApiPropertyOptional({ enum: ['female', 'male', 'other'] })
  @IsOptional()
  @IsIn(['female', 'male', 'other'])
  gender?: string;
  @ApiProperty() @IsMongoId() wardId: string;
  @ApiProperty() @IsMongoId() bedId: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() attendingMemberId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expectedDischargeAt?: string;
}

export class TransferDto {
  @ApiProperty() @IsMongoId() wardId: string;
  @ApiProperty() @IsMongoId() bedId: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() attendingMemberId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DischargeDto {
  @ApiProperty({ enum: ['routine', 'lama', 'referred', 'deceased'] })
  @IsIn(['routine', 'lama', 'referred', 'deceased'])
  type: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  note?: string;

  @ApiPropertyOptional({
    description:
      "Send the discharge summary PDF to the patient's vault (linked patients only)",
  })
  @IsOptional()
  @IsBoolean()
  sendSummary?: boolean;
}

export class AdmissionsQueryDto {
  @ApiPropertyOptional({ enum: ['admitted', 'discharged'] })
  @IsOptional()
  @IsIn(['admitted', 'discharged'])
  status?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() wardId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
}

export class CreateClaimDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() patientId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() admissionId?: string;
  @ApiProperty({ example: 'Star Health' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  payer: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  policyNumber?: string;
  @ApiPropertyOptional({ enum: ['cashless', 'reimbursement'] })
  @IsOptional()
  @IsIn(['cashless', 'reimbursement'])
  claimType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
  @ApiProperty() @IsNumber() @Min(0) amountClaimed: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateClaimDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  payer?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  policyNumber?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  payerClaimRef?: string;
  @ApiPropertyOptional({ enum: ['cashless', 'reimbursement'] })
  @IsOptional()
  @IsIn(['cashless', 'reimbursement'])
  claimType?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountClaimed?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ClaimStatusDto {
  @ApiProperty({ enum: ClaimStatus }) @IsEnum(ClaimStatus) status: ClaimStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountApproved?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  amountSettled?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  payerClaimRef?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ClaimsQueryDto {
  @ApiPropertyOptional({ enum: ClaimStatus })
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) q?: string;
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 7, maximum: 365 })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;
}
