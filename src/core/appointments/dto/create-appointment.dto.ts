import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class CreateAppointmentDto {
  @ApiProperty({
    description: 'Provider profile the appointment is booked with (FR-7.1)',
  })
  @IsMongoId()
  providerId: string;

  @ApiProperty({ description: 'Selected AppointmentSlot (FR-7.2)' })
  @IsMongoId()
  slotId: string;
}
