import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AIInteractionLog,
  AIInteractionLogSchema,
} from './schemas/ai-interaction-log.schema';
import { AiInteractionLogService } from './ai-interaction-log.service';

/**
 * Shared by all four AI submodules (TRD §5.4) — every AI interaction,
 * regardless of service, is written here via AiInteractionLogService.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AIInteractionLog.name, schema: AIInteractionLogSchema },
    ]),
  ],
  providers: [AiInteractionLogService],
  exports: [MongooseModule, AiInteractionLogService],
})
export class AiInteractionLogModule {}
