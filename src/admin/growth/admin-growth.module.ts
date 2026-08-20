import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GrowthCampaign, GrowthCampaignSchema } from './schemas/growth-campaign.schema';
import { AdminGrowthService } from './admin-growth.service';
import { AdminGrowthController } from './admin-growth.controller';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: GrowthCampaign.name, schema: GrowthCampaignSchema }]),
    AuditLogModule,
  ],
  controllers: [AdminGrowthController],
  providers: [AdminGrowthService],
  exports: [AdminGrowthService],
})
export class AdminGrowthModule {}
