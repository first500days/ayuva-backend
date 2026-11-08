import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeviceToken, DeviceTokenSchema } from './schemas/device-token.schema';
import {
  AppNotification,
  AppNotificationSchema,
} from './schemas/app-notification.schema';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { AppNotificationsController } from './app-notifications.controller';
import { AppNotificationsService } from './app-notifications.service';
import { AuthModule } from '../auth/auth.module';
import { reminderQueueProvider } from './queue/reminder-queue.provider';
import { ReminderQueueService } from './queue/reminder-queue.service';
import { ReminderProcessor } from './queue/reminder.processor';
import { fcmSenderProvider } from './fcm/fcm.provider';
import { SMS_SENDER, smsSenderProvider } from './sms/sms-sender';
import { WHATSAPP_SENDER, whatsAppSenderProvider } from './sms/whatsapp-sender';
import { User, UserSchema } from '../core/users/schemas/user.schema';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from '../core/records/schemas/medical-record.schema';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { UserPushService } from './user-push.service';
import { ReportLink, ReportLinkSchema } from './report-delivery/schemas/report-link.schema';
import { ReportLinksService } from './report-delivery/report-links.service';
import { ReportDispatchService } from './report-delivery/report-dispatch.service';
import { PublicReportLinksController } from './report-delivery/public-report-links.controller';

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
    AuditLogModule,
    MongooseModule.forFeature([
      { name: DeviceToken.name, schema: DeviceTokenSchema },
      { name: AppNotification.name, schema: AppNotificationSchema },
      { name: User.name, schema: UserSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: ReportLink.name, schema: ReportLinkSchema },
    ]),
  ],
  controllers: [
    DevicesController,
    AppNotificationsController,
    PublicReportLinksController,
  ],
  providers: [
    DevicesService,
    AppNotificationsService,
    reminderQueueProvider,
    fcmSenderProvider,
    smsSenderProvider,
    whatsAppSenderProvider,
    ReminderQueueService,
    ReminderProcessor,
    UserPushService,
    ReportLinksService,
    ReportDispatchService,
  ],
  exports: [
    ReminderQueueService,
    AppNotificationsService,
    SMS_SENDER,
    WHATSAPP_SENDER,
    UserPushService,
    ReportDispatchService,
  ],
})
export class NotificationsModule {}
