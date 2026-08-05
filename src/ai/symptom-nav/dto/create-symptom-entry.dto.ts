import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CreateSymptomEntryDto {
  @ApiProperty({
    example: 'Sharp chest tightness that comes and goes, worse on stairs.',
  })
  @IsString()
  rawText: string;

  @ApiProperty({ example: 3, description: '"Since X days" (FR-4.2)' })
  @IsInt()
  @Min(0)
  durationDays: number;
}
