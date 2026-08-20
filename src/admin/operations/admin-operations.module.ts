import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminIssue, AdminIssueSchema } from './schemas/admin-issue.schema';
import { AdminOperationsService } from './admin-operations.service';
import { AdminOperationsController } from './admin-operations.controller';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AdminIssue.name, schema: AdminIssueSchema }]),
    AuditLogModule,
  ],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService],
  exports: [AdminOperationsService],
})
export class AdminOperationsModule {}
