import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeviceToken, DeviceTokenSchema } from './schemas/device-token.schema';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { AuthModule } from '../auth/auth.module';
import { reminderQueueProvider } from './queue/reminder-queue.provider';
import { ReminderQueueService } from './queue/reminder-queue.service';
import { ReminderProcessor } from './queue/reminder.processor';
import { fcmSenderProvider } from './fcm/fcm.provider';

/**
 * Push notification / reminder system (FR-10.3, FR-7.6, TRD §2/§7/§8).
 * Exports ReminderQueueService so Medications/Appointments modules can
 * schedule and cancel reminder jobs on create/update/delete without a
 * circular dependency back into this module's controllers.
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: DeviceToken.name, schema: DeviceTokenSchema },
    ]),
  ],
  controllers: [DevicesController],
  providers: [
    DevicesService,
    reminderQueueProvider,
    fcmSenderProvider,
    ReminderQueueService,
    ReminderProcessor,
  ],
  exports: [ReminderQueueService],
})
export class NotificationsModule {}
