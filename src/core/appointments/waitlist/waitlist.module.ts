import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../../auth/auth.module';
import { NotificationsModule } from '../../../notifications/notifications.module';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../../providers/schemas/appointment-slot.schema';
import {
  Provider,
  ProviderSchema,
} from '../../providers/schemas/provider.schema';
import { Appointment, AppointmentSchema } from '../schemas/appointment.schema';
import { WaitlistController } from './waitlist.controller';
import { WaitlistEntry, WaitlistEntrySchema } from './waitlist.schema';
import { WaitlistService } from './waitlist.service';

/** Appointment waitlist and the push when a cancelled slot opens. */
@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: WaitlistEntry.name, schema: WaitlistEntrySchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
  ],
  controllers: [WaitlistController],
  providers: [WaitlistService],
})
export class WaitlistModule {}
