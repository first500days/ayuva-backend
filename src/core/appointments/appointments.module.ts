import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../providers/schemas/appointment-slot.schema';
import { Provider, ProviderSchema } from '../providers/schemas/provider.schema';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: Provider.name, schema: ProviderSchema },
    ]),
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [MongooseModule, AppointmentsService],
})
export class AppointmentsModule {}
