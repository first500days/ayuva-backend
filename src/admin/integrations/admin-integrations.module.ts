import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationConnector, IntegrationConnectorSchema } from './schemas/integration-connector.schema';
import { WebhookLog, WebhookLogSchema } from './schemas/webhook-log.schema';
import { AdminIntegrationsService } from './admin-integrations.service';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IntegrationConnector.name, schema: IntegrationConnectorSchema },
      { name: WebhookLog.name, schema: WebhookLogSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [AdminIntegrationsController],
  providers: [AdminIntegrationsService],
  exports: [AdminIntegrationsService],
})
export class AdminIntegrationsModule {}
