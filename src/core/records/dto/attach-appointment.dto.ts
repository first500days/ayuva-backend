import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

// POST /records/:id/attach-appointment (PRD FR-9.5, TRD §4.4).
export class AttachAppointmentDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7c0' })
  @IsMongoId()
  appointmentId: string;
}
