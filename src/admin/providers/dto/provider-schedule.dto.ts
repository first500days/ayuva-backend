import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { WorkingDay } from '../../../core/providers/schemas/provider.schema';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// PUT /admin/providers/:id/schedule (FR-14.1, FR-14.2).
export class ProviderScheduleDto {
  @ApiProperty({
    enum: WorkingDay,
    isArray: true,
    example: [WorkingDay.MON, WorkingDay.TUE, WorkingDay.WED],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(WorkingDay, { each: true })
  workingDays: WorkingDay[];

  @ApiProperty({ example: '09:00', description: '24h HH:mm' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:mm (24h)' })
  startTime: string;

  @ApiProperty({ example: '17:00', description: '24h HH:mm' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:mm (24h)' })
  endTime: string;

  @ApiProperty({ example: 30, description: 'Slot duration in minutes' })
  @IsInt()
  @Min(5)
  slotDurationMin: number;
}
