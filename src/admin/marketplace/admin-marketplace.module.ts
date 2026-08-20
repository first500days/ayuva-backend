import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketplaceTaxonomy, MarketplaceTaxonomySchema } from './schemas/marketplace-taxonomy.schema';
import { MarketplaceQualityFlag, MarketplaceQualityFlagSchema } from './schemas/marketplace-quality-flag.schema';
import { MarketplaceConfig, MarketplaceConfigSchema } from './schemas/marketplace-config.schema';
import { AdminMarketplaceService } from './admin-marketplace.service';
import { AdminMarketplaceController } from './admin-marketplace.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MarketplaceTaxonomy.name, schema: MarketplaceTaxonomySchema },
      { name: MarketplaceQualityFlag.name, schema: MarketplaceQualityFlagSchema },
      { name: MarketplaceConfig.name, schema: MarketplaceConfigSchema },
    ]),
  ],
  controllers: [AdminMarketplaceController],
  providers: [AdminMarketplaceService],
  exports: [AdminMarketplaceService],
})
export class AdminMarketplaceModule {}
