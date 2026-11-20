import { INSURERS } from '../../core/providers/insurance-estimate';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsNumber,

  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
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
/** One insurer this provider is empanelled with (out-of-pocket estimates in discovery). */
export class InsurancePanelEntryDto {
  @ApiProperty({ enum: INSURERS })
  @IsIn(INSURERS as unknown as string[])
  insurer: string;

  @ApiProperty({ description: 'The insurer settles directly with the provider' })
  @IsBoolean()
  cashless: boolean;

  @ApiProperty({ description: 'Out-patient consultations are covered' })
  @IsBoolean()
  opdCovered: boolean;

  @ApiPropertyOptional({ description: 'Patient share, percent of the fee' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  copayPct?: number;
}

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

  @ApiPropertyOptional({ type: () => [InsurancePanelEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => InsurancePanelEntryDto)
  insurancePanel?: InsurancePanelEntryDto[];

  @ApiPropertyOptional({ type: [PartnerLocationDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PartnerLocationDto)
  locations?: PartnerLocationDto[];

  @ApiPropertyOptional({ type: [String], description: 'Departments / units, e.g. Cardiology, OPD, ICU' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  departments?: string[];
}

export class PartnerAppointmentsQueryDto {
  @ApiPropertyOptional({ enum: ['incoming', 'today', 'upcoming', 'completed'] })
  @IsOptional()
  @IsIn(['incoming', 'today', 'upcoming', 'completed'])
  scope?: 'incoming' | 'today' | 'upcoming' | 'completed';

  @ApiPropertyOptional({ description: 'Only appointments assigned to me' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  mine?: boolean;
}

/** Hospital/clinic front desk: who sees this patient, under which department. */
export class AssignAppointmentDto {
  @ApiPropertyOptional({ nullable: true, description: 'Staff member id; null to unassign' })
  @IsOptional()
  @IsMongoId()
  memberId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
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

/** Front desk books a patient already linked to the organisation (referral, booking, share…) into a slot. */
export class PartnerBookDto {
  @ApiProperty() @IsMongoId() patientId: string;

  @ApiProperty({ description: 'An OPEN slot belonging to this provider' })
  @IsMongoId()
  slotId: string;

  @ApiPropertyOptional({ description: 'The incoming referral this booking answers' })
  @IsOptional()
  @IsMongoId()
  referralId?: string;

  @ApiPropertyOptional() @IsOptional() @IsMongoId() memberId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) department?: string;
}

export class ManualPatientInfoDto {
  @ApiProperty({ example: 'Ramesh Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'ramesh@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'male' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(130)
  age?: number;

  @ApiPropertyOptional({ example: 'Walk-in / offline patient consultation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PartnerManualAppointmentDto {
  @ApiProperty({ type: ManualPatientInfoDto })
  @ValidateNested()
  @Type(() => ManualPatientInfoDto)
  patient: ManualPatientInfoDto;

  @ApiPropertyOptional({ description: 'An OPEN slot belonging to this provider' })
  @IsOptional()
  @IsMongoId()
  slotId?: string;

  @ApiPropertyOptional({ example: '2026-11-20', description: 'Required if slotId is not provided (YYYY-MM-DD)' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({ example: '10:30', description: 'Required if slotId is not provided (HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be in HH:MM format' })
  time?: string;

  @ApiPropertyOptional({ example: 15, default: 15 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  durationMin?: number;

  @ApiPropertyOptional({ description: 'Staff member ID assigned to this visit' })
  @IsOptional()
  @IsMongoId()
  memberId?: string;

  @ApiPropertyOptional({ example: 'General Medicine' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @ApiPropertyOptional({ enum: ['pending', 'paid'], default: 'pending' })
  @IsOptional()
  @IsString()
  paymentStatus?: string;
}

export class PartnerSlotsQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;
}

export class PartnerDaySlotsQueryDto {
  @ApiProperty({ example: '2026-10-23' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;
}

export class PartnerBlockSlotDto {
  @ApiPropertyOptional({ example: 'Doctor in surgery' })
  @IsOptional()
  @IsString()
  reason?: string;
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

