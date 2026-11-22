import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../../notifications/notifications.module';
import {
  Provider,
  ProviderSchema,
} from '../../core/providers/schemas/provider.schema';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import {
  PartnerMember,
  PartnerMemberSchema,
} from '../staff/schemas/partner-member.schema';
import {
  PartnerNotificationSettings,
  PartnerNotificationSettingsSchema,
} from './schemas/partner-notification-settings.schema';
import {
  PartnerWebhookDelivery,
  PartnerWebhookDeliverySchema,
} from './schemas/partner-webhook-delivery.schema';
import { PartnerNotifierService } from './partner-notifier.service';
import { PartnerNotifySettingsService } from './partner-notify-settings.service';

/**
 * Partner Notification Center. Deliberately free of any core/partner feature
 * module imports so patient-side modules (appointments, sharing) can raise
 * partner events without a circular dependency.
 */
@Module({
  imports: [
    NotificationsModule,
    MongooseModule.forFeature([
      { name: PartnerMember.name, schema: PartnerMemberSchema },
      {
        name: PartnerNotificationSettings.name,
        schema: PartnerNotificationSettingsSchema,
      },
      {
        name: PartnerWebhookDelivery.name,
        schema: PartnerWebhookDeliverySchema,
      },
      { name: Provider.name, schema: ProviderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [PartnerNotifierService, PartnerNotifySettingsService],
  exports: [PartnerNotifierService, PartnerNotifySettingsService],
})
export class PartnerNotifyModule {}
