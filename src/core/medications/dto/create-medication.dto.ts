import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateMedicationDto {
  @ApiProperty({ example: 'Amlodipine' })
  @IsString()
  name: string;

  @ApiProperty({ example: '5 mg' })
  @IsString()
  dosage: string;

  @ApiProperty({ example: 'Once daily · morning' })
  @IsString()
  frequency: string;

  @ApiProperty({
    type: [String],
    example: ['08:00'],
    description: 'Empty for "as needed" medications with no fixed schedule',
  })
  @IsArray()
  @IsString({ each: true })
  scheduleTimes: string[];

  @ApiPropertyOptional({
    example: 7,
    description:
      'Days of remaining supply that triggers a refill alert (FR-10.4)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  refillThresholdDays?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
