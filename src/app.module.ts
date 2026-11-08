import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { CoreModule } from './core/core.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { PartnerModule } from './partner/partner.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LiveModule } from './common/live/live.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    LiveModule,
    DatabaseModule,
    AuthModule,
    HealthModule,
    NotificationsModule,
    CoreModule,
    AiModule,
    AdminModule,
    PartnerModule,
  ],
})
export class AppModule {}
