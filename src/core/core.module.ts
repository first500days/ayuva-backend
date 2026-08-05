import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { HealthProfileModule } from './health-profile/health-profile.module';
import { ProfileModule } from './profile/profile.module';
import { MedicationsModule } from './medications/medications.module';
import { ProvidersModule } from './providers/providers.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { RecordsModule } from './records/records.module';
import { FeedbackModule } from './feedback/feedback.module';
import { DashboardModule } from './dashboard/dashboard.module';

/**
 * Core Service domain (TRD §1): users, providers, appointments, records.
 * Kept as its own module tree — separate from the AI domain — so it can be
 * split into an independently deployed service later without a rewrite.
 */
@Module({
  imports: [
    UsersModule,
    HealthProfileModule,
    ProfileModule,
    MedicationsModule,
    ProvidersModule,
    AppointmentsModule,
    RecordsModule,
    FeedbackModule,
    DashboardModule,
  ],
})
export class CoreModule {}
