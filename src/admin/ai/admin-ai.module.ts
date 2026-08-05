import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AIInteractionLog,
  AIInteractionLogSchema,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import { AuthModule } from '../../auth/auth.module';
import { AdminAiController } from './admin-ai.controller';
import { AdminAiService } from './admin-ai.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: AIInteractionLog.name, schema: AIInteractionLogSchema },
    ]),
  ],
  controllers: [AdminAiController],
  providers: [AdminAiService],
})
export class AdminAiModule {}
