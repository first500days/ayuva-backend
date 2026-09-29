import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,

  IsOptional,
  IsString,

  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ProviderCategory } from '../../core/providers/schemas/provider.schema';
import { IsStrongPassword } from '../../common/validators/is-strong-password.decorator';

/** P01 — partner sign-up. Creates a login plus a PENDING provider profile awaiting admin verification. */
export class PartnerRegisterDto {
  @ApiProperty({ example: 'Dr. Priya Menon' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsStrongPassword()
  password: string;

  @ApiProperty({ example: 'Menon Cardiac Clinic' })
  @IsString()
  @MinLength(2)
  organisationName: string;

  @ApiProperty({ enum: ProviderCategory })
  @IsEnum(ProviderCategory)
  type: ProviderCategory;

  @ApiProperty({ type: [String], example: ['Cardiology'] })
  @IsArray()
  @IsString({ each: true })
  specialty: string[];

  @ApiProperty({ example: 'KMC-104233' })
  @IsString()
  @MinLength(3)
  registrationNumber: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualifications?: string[];

  @ApiProperty({ description: 'Must be true' })
  @IsBoolean()
  termsAccepted: boolean;

  @ApiProperty({ description: 'Must be true' })
  @IsBoolean()
  privacyAccepted: boolean;
}

class PartnerLocationDto {
  @ApiProperty() @IsString() label: string;
  @ApiProperty() @IsString() address: string;
}

/** P02 — editable profile fields. */
export class UpdatePartnerProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialty?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualifications?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) experienceYears?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) consultationFee?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() bio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() profileImageUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiresApproval?: boolean;

  @ApiPropertyOptional({ type: [PartnerLocationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PartnerLocationDto)
  locations?: PartnerLocationDto[];
}

export class PartnerAppointmentsQueryDto {
  @ApiPropertyOptional({ enum: ['incoming', 'today', 'upcoming', 'completed'] })
  @IsOptional()
  @IsIn(['incoming', 'today', 'upcoming', 'completed'])
  scope?: 'incoming' | 'today' | 'upcoming' | 'completed';
}

export class RejectAppointmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class PartnerRescheduleDto {
  @ApiProperty({ description: 'An OPEN slot belonging to this provider' })
  @IsString()
  newSlotId: string;
}

export class PartnerFollowUpDto {
  @ApiProperty({ description: 'An OPEN slot belonging to this provider' })
  @IsString()
  slotId: string;
}

export class PartnerSlotsQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;
}

export class PartnerPaymentsQueryDto {
  @ApiPropertyOptional({ enum: ['SUCCESSFUL', 'PENDING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['settled', 'unsettled'] })
  @IsOptional()
  @IsIn(['settled', 'unsettled'])
  settlement?: 'settled' | 'unsettled';
}

