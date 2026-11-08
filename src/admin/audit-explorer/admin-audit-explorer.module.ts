import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from '../../audit-log/schemas/audit-log.schema';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { AdminAuditExplorerService } from './admin-audit-explorer.service';
import { AdminAuditExplorerController } from './admin-audit-explorer.controller';

@Module({
  imports: [
    AuditLogModule,
    MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
  ],
  controllers: [AdminAuditExplorerController],
  providers: [AdminAuditExplorerService],
  exports: [AdminAuditExplorerService],
})
export class AdminAuditExplorerModule {}
