import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { WorkingDay } from '../../../core/providers/schemas/provider.schema';
import { IsStrongPassword } from '../../../common/validators/is-strong-password.decorator';
import { StaffRole } from '../../rbac/partner-permissions';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DutyBlockDto {
  @ApiProperty({ enum: WorkingDay }) @IsEnum(WorkingDay) day: WorkingDay;
  @ApiProperty({ example: '09:00' })
  @Matches(HHMM, { message: 'start must be HH:mm' })
  start: string;
  @ApiProperty({ example: '17:00' })
  @Matches(HHMM, { message: 'end must be HH:mm' })
  end: string;
}

export class InviteStaffDto {
  @ApiProperty({ example: 'Dr. Arjun Rao' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @ApiProperty() @IsEmail() email: string;

  @ApiProperty({ enum: StaffRole }) @IsEnum(StaffRole) role: StaffRole;

  @ApiPropertyOptional({ example: 'Consultant Cardiologist' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: 'Cardiology' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @ApiPropertyOptional({
    description: 'E.164, used for SMS alerts',
    example: '+919876543210',
  })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Medical council registration — printed on e-prescriptions',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({ enum: StaffRole })
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^(\+[1-9]\d{6,14})?$/, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string;

  @ApiPropertyOptional({ type: [DutyBlockDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => DutyBlockDto)
  dutySchedule?: DutyBlockDto[];
}

/** What a member may change about themselves (no role or department changes). */
export class UpdateOwnStaffProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^(\+[1-9]\d{6,14})?$/, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string;
}

export class AcceptInviteDto {
  @ApiProperty() @IsString() @MinLength(20) token: string;
  @ApiProperty() @IsStrongPassword() password: string;

  @ApiProperty({ description: 'Must be true' })
  @IsBoolean()
  @Equals(true, {
    message: 'Terms of Service and Privacy Policy must be accepted',
  })
  termsAccepted: boolean;
}
