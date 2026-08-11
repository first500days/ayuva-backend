import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

// POST /assistant/chat (TRD §4, §5).
export class ChatRequestDto {
  @ApiProperty({ example: 'How do I book an appointment with a specialist?' })
  @IsString()
  @MinLength(1)
  message: string;
}
