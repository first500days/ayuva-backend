import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** A prescriber's prescription pad. Empty string clears a field. */
export class UpdateRxPadDto {
  @ApiPropertyOptional({ example: 'Dr. Aryan Mehta' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  printedName?: string;

  @ApiPropertyOptional({ example: 'MBBS, MD (General Medicine)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  qualifications?: string;

  @ApiPropertyOptional({ example: 'Consultant Physician' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialty?: string;

  @ApiPropertyOptional({ example: 'Mon–Sat 10:00–13:00, 17:00–20:00' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  timings?: string;

  @ApiPropertyOptional({ example: '+91 80 1234 5678' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  contact?: string;
}
