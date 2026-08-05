import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

// GET /admin/analytics/ai-interactions-over-time?period=daily|weekly (FR-11.2).
export class QueryAiInteractionsOverTimeDto {
  @ApiPropertyOptional({ enum: ['daily', 'weekly'], default: 'weekly' })
  @IsOptional()
  @IsIn(['daily', 'weekly'])
  period?: 'daily' | 'weekly';
}
