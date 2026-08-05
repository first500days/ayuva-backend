import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AiService } from '../../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';

export class QueryAiLogsDto {
  @ApiPropertyOptional({ enum: AiService })
  @IsOptional()
  @IsEnum(AiService)
  service?: AiService;
}
