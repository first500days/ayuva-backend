import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeviceToken, DeviceTokenSchema } from './schemas/device-token.schema';
import { AppNotification, AppNotificationSchema } from './schemas/app-notification.schema';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { AppNotificationsController } from './app-notifications.controller';
import { AppNotificationsService } from './app-notifications.service';
import { AuthModule } from '../auth/auth.module';
import { reminderQueueProvider } from './queue/reminder-queue.provider';
import { ReminderQueueService } from './queue/reminder-queue.service';
import { ReminderProcessor } from './queue/reminder.processor';
import { fcmSenderProvider } from './fcm/fcm.provider';

/**
 * Push notification / reminder system (FR-10.3, FR-7.6, TRD §2/§7/§8).
 * Also exposes in-app notification list and preferences (FR-37).
 * Exports ReminderQueueService so Medications/Appointments modules can
 * schedule and cancel reminder jobs on create/update/delete without a
 * circular dependency back into this module's controllers.
 * Exports AppNotificationsService so other modules can create in-app records.
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: DeviceToken.name, schema: DeviceTokenSchema },
      { name: AppNotification.name, schema: AppNotificationSchema },
    ]),
  ],
  controllers: [DevicesController, AppNotificationsController],
  providers: [
    DevicesService,
    AppNotificationsService,
    reminderQueueProvider,
    fcmSenderProvider,
    ReminderQueueService,
    ReminderProcessor,
  ],
  exports: [ReminderQueueService, AppNotificationsService],
})
export class NotificationsModule {}
