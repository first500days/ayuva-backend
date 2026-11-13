import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrepPack, PrepPackSchema } from './schemas/prep-pack.schema';
import { Provider, ProviderSchema } from '../../core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../../core/providers/schemas/appointment-slot.schema';
import {
  DiagnosticTest,
  DiagnosticTestSchema,
} from '../../core/labs/schemas/diagnostic-test.schema';
import {
  LabDeliveryOrder,
  LabDeliveryOrderSchema,
} from '../../core/labs/schemas/lab-delivery-order.schema';
import { PrepPackController } from './prep-pack.controller';
import { PrepPackService } from './prep-pack.service';
import { AuthModule } from '../../auth/auth.module';
import { AppointmentsModule } from '../../core/appointments/appointments.module';
import { MedicationsModule } from '../../core/medications/medications.module';
import { RecordsModule } from '../../core/records/records.module';

@Module({
  imports: [
    AuthModule,
    AppointmentsModule,
    MedicationsModule,
    RecordsModule,
    MongooseModule.forFeature([
      { name: PrepPack.name, schema: PrepPackSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: DiagnosticTest.name, schema: DiagnosticTestSchema },
      { name: LabDeliveryOrder.name, schema: LabDeliveryOrderSchema },
    ]),
  ],
  controllers: [PrepPackController],
  providers: [PrepPackService],
})
export class PrepPackModule {}
