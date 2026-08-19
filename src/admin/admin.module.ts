import { Module } from '@nestjs/common';
import { AdminAnalyticsModule } from './analytics/admin-analytics.module';
import { AdminUsersModule } from './users/admin-users.module';
import { AdminProvidersModule } from './providers/admin-providers.module';
import { AdminAppointmentsModule } from './appointments/admin-appointments.module';
import { AdminAiModule } from './ai/admin-ai.module';
import { AdminReportsModule } from './reports/admin-reports.module';
import { AdminFeedbackModule } from './feedback/admin-feedback.module';
import { AdminHospitalsModule } from './hospitals/admin-hospitals.module';
import { AdminLabsModule } from './labs/admin-labs.module';
import { AdminRecordsModule } from './records/admin-records.module';
import { AdminPaymentsModule } from './payments/admin-payments.module';
import { AdminAdminUsersModule } from './admin-users/admin-admin-users.module';
import { AdminRolesModule } from './roles/admin-roles.module';
import { AdminContentModule } from './content/admin-content.module';

/**
 * Admin Portal API surface (TRD §4.6-4.7, PRD FR-11-17). Every route here is
 * gated behind JwtAuthGuard + RolesGuard/@Roles(admin) — see each sub-module's
 * controller. Reads straight off Core/AI domain schemas; adds no new AI
 * business logic (the ai/ module tree stays Phase-3-owned).
 */
@Module({
  imports: [
    AdminAnalyticsModule,
    AdminUsersModule,
    AdminProvidersModule,
    AdminAppointmentsModule,
    AdminAiModule,
    AdminReportsModule,
    AdminFeedbackModule,
    AdminHospitalsModule,
    AdminLabsModule,
    AdminRecordsModule,
    AdminPaymentsModule,
    AdminAdminUsersModule,
    AdminRolesModule,
    AdminContentModule,
  ],
})
export class AdminModule {}
