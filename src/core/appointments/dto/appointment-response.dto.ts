import { ApiProperty } from '@nestjs/swagger';
import { AppointmentStatus } from '../schemas/appointment.schema';

export class AppointmentResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  providerId: string;

  @ApiProperty({ example: 'Dr. Priya Menon' })
  providerName: string;

  @ApiProperty({ example: 'Cardiologist · Heart & Vascular' })
  specialty: string;

  @ApiProperty({ example: '2026-08-14' })
  date: string;

  @ApiProperty({ example: '10:30' })
  time: string;

  @ApiProperty({ enum: AppointmentStatus })
  status: AppointmentStatus;

  @ApiProperty({ example: false, description: 'FR-7.6 "Set reminder" state' })
  reminderEnabled: boolean;
}
