import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FounderDoc, FounderDocSchema } from './schemas/founder-doc.schema';
import { FounderMilestone, FounderMilestoneSchema } from './schemas/founder-milestone.schema';
import { FounderRisk, FounderRiskSchema } from './schemas/founder-risk.schema';
import { AdminFounderService } from './admin-founder.service';
import { AdminFounderController } from './admin-founder.controller';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FounderDoc.name, schema: FounderDocSchema },
      { name: FounderMilestone.name, schema: FounderMilestoneSchema },
      { name: FounderRisk.name, schema: FounderRiskSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [AdminFounderController],
  providers: [AdminFounderService],
  exports: [AdminFounderService],
})
export class AdminFounderModule {}
