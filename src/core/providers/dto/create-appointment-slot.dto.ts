import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsString, Min } from 'class-validator';

export class CreateAppointmentSlotDto {
  @ApiProperty({ example: '2026-08-14' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: '10:30' })
  @IsString()
  time: string;

  @ApiProperty({
    example: 30,
    description: 'Configurable slot duration in minutes (FR-14.2)',
  })
  @IsInt()
  @Min(5)
  durationMin: number;
}
