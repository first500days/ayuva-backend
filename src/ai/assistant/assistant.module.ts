import { Module } from '@nestjs/common';
import { AssistantController, MobileAiController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AuthModule } from '../../auth/auth.module';
import { AiInteractionLogModule } from '../ai-interaction-log/ai-interaction-log.module';

/**
 * POST /assistant/chat (TRD §4, §5) — MOCK conversational responses
 * (docs/AI_INTEGRATION_CONTRACT.md). No dedicated schema: every turn is
 * stateless and logged to the shared AIInteractionLog.
 * Also serves POST /ai/chat alias for the mobile client.
 */
@Module({
  imports: [AuthModule, AiInteractionLogModule],
  controllers: [AssistantController, MobileAiController],
  providers: [AssistantService],
})
export class AssistantModule {}
