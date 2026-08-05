import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString, MinLength } from 'class-validator';

// POST /admin/providers/:id/blocked-dates (FR-14.4).
export class BlockedDateDto {
  @ApiProperty({ example: '2026-12-25', description: 'ISO date (YYYY-MM-DD)' })
  @IsISO8601()
  date: string;

  @ApiProperty({ example: 'Public holiday' })
  @IsString()
  @MinLength(1)
  reason: string;
}
