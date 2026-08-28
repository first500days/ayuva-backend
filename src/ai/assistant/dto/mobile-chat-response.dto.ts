import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ example: 'msg_1a2b3c' })
  id: string;

  @ApiProperty({ example: 'assistant' })
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'You can book a specialist from the Providers tab.' })
  text: string;

  @ApiProperty({ example: '2026-08-27T10:00:00.000Z' })
  createdAt: string;
}

export class ChatSuggestedActionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ description: 'MaterialIcons glyph name' })
  icon: string;

  @ApiProperty()
  route: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  params?: Record<string, string>;

  @ApiProperty({ description: 'True if the action must be confirmed before executing' })
  consequential: boolean;
}

/** POST /ai/chat — shape the mobile app expects back (services/api/chat.ts ChatReply). */
export class MobileChatResponseDto {
  @ApiProperty({ type: ChatMessageDto })
  message: ChatMessageDto;

  @ApiProperty({ type: [ChatSuggestedActionDto] })
  suggestedActions: ChatSuggestedActionDto[];
}
