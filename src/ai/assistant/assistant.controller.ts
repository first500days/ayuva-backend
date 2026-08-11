import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { AssistantService } from './assistant.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

// MOCK implementation (TRD §6, docs/AI_INTEGRATION_CONTRACT.md) — the real
// conversational model is owned by a separate team.
@ApiTags('AI - Conversational Assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
