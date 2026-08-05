import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsMongoId, IsOptional } from 'class-validator';

export enum PatientAppointmentAction {
  CANCELLED = 'cancelled',
}

export class PatchAppointmentDto {
  @ApiPropertyOptional({
    enum: PatientAppointmentAction,
    description: 'Set to "cancelled" to cancel the visit (FR-7.6)',
  })
  @IsOptional()
  @IsEnum(PatientAppointmentAction)
  status?: PatientAppointmentAction;

  @ApiPropertyOptional({
    description:
      'A different open AppointmentSlot with the same provider, to reschedule (FR-7.6)',
  })
  @IsOptional()
  @IsMongoId()
  newSlotId?: string;

  @ApiPropertyOptional({
    description:
      'Toggle a scheduled push reminder before the visit (FR-7.6 "Set reminder")',
  })
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;
}
