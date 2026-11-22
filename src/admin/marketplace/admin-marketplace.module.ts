import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketplaceTaxonomy, MarketplaceTaxonomySchema } from './schemas/marketplace-taxonomy.schema';
import { MarketplaceQualityFlag, MarketplaceQualityFlagSchema } from './schemas/marketplace-quality-flag.schema';
import { MarketplaceConfig, MarketplaceConfigSchema } from './schemas/marketplace-config.schema';
import { Provider, ProviderSchema } from '../../core/providers/schemas/provider.schema';
import { Hospital, HospitalSchema } from '../../core/hospitals/schemas/hospital.schema';
import {
  LabCatalogItem,
  LabCatalogItemSchema,
} from '../../partner/lab/schemas/lab-catalog-item.schema';
import { AdminMarketplaceService } from './admin-marketplace.service';
import { AdminMarketplaceController } from './admin-marketplace.controller';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    AuditLogModule,
    MongooseModule.forFeature([
      { name: MarketplaceTaxonomy.name, schema: MarketplaceTaxonomySchema },
      { name: MarketplaceQualityFlag.name, schema: MarketplaceQualityFlagSchema },
      { name: MarketplaceConfig.name, schema: MarketplaceConfigSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: Hospital.name, schema: HospitalSchema },
      { name: LabCatalogItem.name, schema: LabCatalogItemSchema },
    ]),
  ],
  controllers: [AdminMarketplaceController],
  providers: [AdminMarketplaceService],
  exports: [AdminMarketplaceService],
})
export class AdminMarketplaceModule {}
