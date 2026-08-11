import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { AppointmentStatus } from '../../../core/appointments/schemas/appointment.schema';

// GET /admin/appointments (PRD Admin Portal Appointment Slot Management).
export class QueryAdminAppointmentsDto {
  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  @IsOptional()
  @IsMongoId()
  providerId?: string;

  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
