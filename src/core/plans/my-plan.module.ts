import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Plan,
  PlanSchema,
  Subscription,
  SubscriptionSchema,
} from '../../admin/subscriptions/schemas/subscription.schema';
import { AuthModule } from '../../auth/auth.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { MyPlanController } from './my-plan.controller';
import { PlanUpdatesService } from './plan-updates.service';

/** GET /me/plan and the live hand-off of Admin Panel plan changes to the app. */
@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [MyPlanController],
  providers: [PlanUpdatesService],
  exports: [PlanUpdatesService],
})
export class MyPlanModule {}
