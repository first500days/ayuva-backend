import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LabDeliveryOrder, LabDeliveryOrderSchema } from '../../core/labs/schemas/lab-delivery-order.schema';
import { AdminLabDeliveriesService } from './admin-lab-deliveries.service';
import { AdminLabDeliveriesController } from './admin-lab-deliveries.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: LabDeliveryOrder.name, schema: LabDeliveryOrderSchema }]),
  ],
  controllers: [AdminLabDeliveriesController],
  providers: [AdminLabDeliveriesService],
  exports: [AdminLabDeliveriesService],
})
export class AdminLabDeliveriesModule {}