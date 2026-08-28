import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssistantService } from './assistant.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { MobileChatRequestDto } from './dto/mobile-chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { MobileChatResponseDto } from './dto/mobile-chat-response.dto';

// MOCK implementation (TRD §6, docs/AI_INTEGRATION_CONTRACT.md) — the real
// conversational model is owned by a separate team.
@ApiTags('AI - Conversational Assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  @ApiOperation({
    summary:
      'Natural-language query scoped to navigation/organization topics (FR-6.1)',
  })
  @ApiCreatedResponse({ type: ChatResponseDto })
  chat(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    return this.assistantService.chat(user.sub, dto);
  }
}

/**
 * Mobile alias controller — the mobile app calls POST /ai/chat with a different
 * request/response shape. This controller bridges the two without changing either
 * the mobile or the AssistantService internals.
 */
@ApiTags('AI - Conversational Assistant (Mobile)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('ai')
export class MobileAiController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Mobile chat alias — POST /ai/chat (same service as /assistant/chat)',
  })
  @ApiCreatedResponse({ type: MobileChatResponseDto })
  async chat(
    @CurrentUser() user: JwtPayload,
    @Body() dto: MobileChatRequestDto,
  ): Promise<MobileChatResponseDto> {
    const internalDto: ChatRequestDto = { message: dto.text };
    const result = await this.assistantService.chat(user.sub, internalDto);
    return {
      message: {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        text: result.reply,
        createdAt: new Date().toISOString(),
      },
      suggestedActions: [],
    };
  }
}
