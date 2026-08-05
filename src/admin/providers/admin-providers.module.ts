import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Provider,
  ProviderSchema,
} from '../../core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../../core/providers/schemas/appointment-slot.schema';
import { AuthModule } from '../../auth/auth.module';
import { AdminProvidersController } from './admin-providers.controller';
import { AdminProvidersService } from './admin-providers.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Provider.name, schema: ProviderSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
    ]),
  ],
  controllers: [AdminProvidersController],
  providers: [AdminProvidersService],
})
export class AdminProvidersModule {}
