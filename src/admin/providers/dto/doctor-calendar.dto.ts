import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEnum, Matches } from 'class-validator';
import { WorkingDay } from '../../../core/providers/schemas/provider.schema';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DoctorCalendarQueryDto {
  @ApiProperty({ example: '2026-10-23' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;
}

/** One weekly duty block, e.g. Mon 09:00–17:00 (mirrors the Partner Portal roster). */
export class DutyBlockResponseDto {
  @ApiProperty({ enum: WorkingDay }) day: WorkingDay;
  @ApiProperty({ example: '09:00' }) start: string;
  @ApiProperty({ example: '17:00' }) end: string;
}

export class AdminDoctorResponseDto {
  @ApiProperty({ description: 'PartnerMember id' }) id: string;
  @ApiProperty({ example: 'Dr. Kavya Rao' }) fullName: string;
  @ApiPropertyOptional({ example: 'Consultant Cardiologist' }) title?: string;
  @ApiPropertyOptional({ example: 'Cardiology' }) department?: string;
  @ApiPropertyOptional() registrationNumber?: string;
  @ApiProperty({ enum: ['invited', 'active', 'suspended'] }) status: string;
  @ApiProperty({ type: [DutyBlockResponseDto] }) dutySchedule: DutyBlockResponseDto[];
}

export class DoctorSlotResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: '10:30' }) time: string;
  @ApiProperty({ example: 30 }) durationMin: number;
  @ApiProperty({ enum: ['open', 'booked', 'blocked'] }) status: string;
  @ApiProperty({ description: 'A booking in this slot is assigned to this doctor' })
  assignedToDoctor: boolean;
  @ApiPropertyOptional({ example: 'confirmed' }) appointmentStatus?: string;
}

export class AdminDoctorCalendarResponseDto {
  @ApiProperty({ type: AdminDoctorResponseDto }) doctor: AdminDoctorResponseDto;
  @ApiProperty({ example: '2026-10-23' }) date: string;
  @ApiProperty({ type: [DutyBlockResponseDto], description: 'Duty blocks on this weekday' })
  dutyBlocks: { start: string; end: string }[];
  @ApiPropertyOptional({ example: 'Public holiday' }) blockedReason?: string;
  @ApiProperty({
    type: [DoctorSlotResponseDto],
    description: "The facility's slots inside this doctor's duty hours, plus any booking assigned to them",
  })
  slots: DoctorSlotResponseDto[];
}

/** Working days + one block of hours, the same shape the facility schedule uses. */
export class DoctorScheduleDto {
  @ApiProperty({ enum: WorkingDay, isArray: true, example: ['mon', 'tue', 'wed'] })
  @IsArray()
  @ArrayUnique()
  @IsEnum(WorkingDay, { each: true })
  workingDays: WorkingDay[];

  @ApiProperty({ example: '09:00' })
  @Matches(HH_MM, { message: 'startTime must be HH:mm' })
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @Matches(HH_MM, { message: 'endTime must be HH:mm' })
  endTime: string;
}
