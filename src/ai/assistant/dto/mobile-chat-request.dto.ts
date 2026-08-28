import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

/** POST /ai/chat — shape the mobile app sends (services/api/chat.ts ChatAskParams). */
export class MobileChatRequestDto {
  @ApiProperty({ example: 'How do I book an appointment?' })
  @IsString()
  @MinLength(1)
  text: string;

  @ApiProperty({ example: 'dashboard', description: 'Screen context the user is on' })
  @IsString()
  context: string;

  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @IsString()
  contextLabel?: string;

  @ApiPropertyOptional({ example: 'apt_123' })
  @IsOptional()
  @IsString()
  contextId?: string;
}
