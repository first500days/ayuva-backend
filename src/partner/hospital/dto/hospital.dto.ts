import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { BedStatus, WARD_TYPES, WardGender } from '../schemas/ward.schema';
import { ClaimStatus } from '../schemas/insurance-claim.schema';
import { DeskPaymentMethod } from '../schemas/bill-payment.schema';

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
  @ApiPropertyOptional({ enum: WardGender, default: WardGender.MIXED })
  @IsOptional()
  @IsEnum(WardGender)
  genderPolicy?: WardGender;
  @ApiProperty({ minimum: 1, maximum: 200, description: 'Total bed capacity' })
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
  @ApiPropertyOptional({ enum: WardGender })
  @IsOptional()
  @IsEnum(WardGender)
  genderPolicy?: WardGender;
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 300,
    description:
      'Total bed capacity. Raising it adds beds; lowering it removes free beds only.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  bedCapacity?: number;
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
  @ApiPropertyOptional({
    enum: ['female', 'male', 'other'],
    description:
      'Records the gender when the admission has none (male/female wards need it)',
  })
  @IsOptional()
  @IsIn(['female', 'male', 'other'])
  gender?: string;
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
  @ApiProperty({ example: 'Star Health', description: 'Insurer (payer)' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  payer: string;
  @ApiPropertyOptional({
    example: 'Medi Assist',
    description: 'Third-party administrator handling the claim, if any',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  tpaName?: string;
  @ApiPropertyOptional({
    description: 'Pre-authorisation reference from the TPA / insurer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  preAuthId?: string;
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
  @MaxLength(120)
  tpaName?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  preAuthId?: string;
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
  @ApiPropertyOptional({
    description: 'Pre-authorisation reference, usually given on approval',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  preAuthId?: string;
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

export class BillPaymentPartDto {
  @ApiProperty({ enum: DeskPaymentMethod })
  @IsEnum(DeskPaymentMethod)
  method: DeskPaymentMethod;
  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10_000_000)
  amount: number;
  @ApiPropertyOptional({ description: 'Card slip, UPI or cheque reference' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;
  @ApiPropertyOptional({
    description: 'Insurance claim this share is billed to',
  })
  @IsOptional()
  @IsMongoId()
  claimId?: string;
}

/** A bill settled at the billing desk, possibly through several payment methods. */
export class RecordBillPaymentDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() admissionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() patientId?: string;
  @ApiPropertyOptional({
    description: 'Required without an admission or patient',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  patientName?: string;
  @ApiPropertyOptional({ example: 'Final IPD bill' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
  @ApiProperty({
    type: [BillPaymentPartDto],
    description: 'One entry per payment method',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => BillPaymentPartDto)
  parts: BillPaymentPartDto[];
}

export class VoidBillPaymentDto {
  @ApiProperty({ example: 'Entered against the wrong patient' })
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  reason: string;
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
