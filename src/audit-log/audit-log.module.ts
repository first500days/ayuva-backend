import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditLogService } from './audit-log.service';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { AuditSeal, AuditSealSchema } from './schemas/audit-seal.schema';
import { AuditSealService } from './audit-seal.service';
import {
  AccessLog,
  AccessLogSchema,
} from '../core/sharing/schemas/access-log.schema';

/**
 * Platform-wide compliance audit trail (TRD §7). Kept as its own top-level
 * domain, like notifications/storage, so it can be imported anywhere
 * without pulling in Core/AI/Admin module trees.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: AuditSeal.name, schema: AuditSealSchema },
    ]),
  ],
  providers: [AuditLogService, AuditLogInterceptor, AuditSealService],
  exports: [AuditLogService, AuditLogInterceptor, AuditSealService],
})
export class AuditLogModule {}
