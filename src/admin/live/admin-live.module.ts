import { ExceptionWatchService } from './exception-watch.service';
import {
  AdminIssue,
  AdminIssueSchema,
} from '../operations/schemas/admin-issue.schema';
import {
  Provider,
  ProviderSchema,
} from '../../core/providers/schemas/provider.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AIInteractionLog,
  AIInteractionLogSchema,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import { AuthModule } from '../../auth/auth.module';
import { AdminLiveGateway } from './admin-live.gateway';
import { SystemPulseService } from './system-pulse.service';

/** The Admin Panel's live socket: system graph and log tail. */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: AIInteractionLog.name, schema: AIInteractionLogSchema },
      { name: AdminIssue.name, schema: AdminIssueSchema },
      { name: Provider.name, schema: ProviderSchema },
    ]),
  ],
  providers: [SystemPulseService, AdminLiveGateway, ExceptionWatchService],
  exports: [SystemPulseService],
})
export class AdminLiveModule {}
