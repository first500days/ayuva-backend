import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AIInteractionLog,
  AIInteractionLogSchema,
} from './schemas/ai-interaction-log.schema';

/**
 * Shared by all three AI submodules (TRD §5.4) — every AI interaction,
 * regardless of service, is written here. Schema registration only.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AIInteractionLog.name, schema: AIInteractionLogSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class AiInteractionLogModule {}
