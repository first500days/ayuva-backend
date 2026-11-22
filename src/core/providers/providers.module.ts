import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Provider, ProviderSchema } from './schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from './schemas/appointment-slot.schema';
import {
  MarketplaceTaxonomy,
  MarketplaceTaxonomySchema,
} from '../../admin/marketplace/schemas/marketplace-taxonomy.schema';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Provider.name, schema: ProviderSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      // Read-only here: patient search expands queries through these categories.
      { name: MarketplaceTaxonomy.name, schema: MarketplaceTaxonomySchema },
    ]),
  ],
  controllers: [ProvidersController],
  providers: [ProvidersService],
  exports: [MongooseModule],
})
export class ProvidersModule {}
