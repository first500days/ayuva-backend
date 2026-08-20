import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiSurfaceConfig, AiSurfaceConfigSchema } from './schemas/ai-surface-config.schema';
import { AiToolPermission, AiToolPermissionSchema } from './schemas/ai-tool-permission.schema';
import { AiRelease, AiReleaseSchema } from './schemas/ai-release.schema';
import { AiKnowledgeSource, AiKnowledgeSourceSchema } from './schemas/ai-knowledge-source.schema';
import { AdminAiControlService } from './admin-ai-control.service';
import { AdminAiControlController } from './admin-ai-control.controller';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AiSurfaceConfig.name, schema: AiSurfaceConfigSchema },
      { name: AiToolPermission.name, schema: AiToolPermissionSchema },
      { name: AiRelease.name, schema: AiReleaseSchema },
      { name: AiKnowledgeSource.name, schema: AiKnowledgeSourceSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [AdminAiControlController],
  providers: [AdminAiControlService],
  exports: [AdminAiControlService],
})
export class AdminAiControlModule {}
