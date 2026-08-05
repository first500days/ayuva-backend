import { ApiProperty } from '@nestjs/swagger';
import { AppointmentSlotStatus } from '../schemas/appointment-slot.schema';

export class AppointmentSlotResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  id: string;

  @ApiProperty({ example: '2026-08-14' })
  date: string;

  @ApiProperty({ example: '10:30' })
  time: string;

  @ApiProperty({
    enum: ['morning', 'afternoon'],
    description: 'Derived from time for FR-7.2 grouping',
  })
  period: 'morning' | 'afternoon';

  @ApiProperty({ example: 30 })
  durationMin: number;

  @ApiProperty({ enum: AppointmentSlotStatus })
  status: AppointmentSlotStatus;
}
