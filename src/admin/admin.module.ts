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
import { AdminOperationsModule } from './operations/admin-operations.module';
import { AdminMarketplaceModule } from './marketplace/admin-marketplace.module';
import { AdminAiControlModule } from './ai-control/admin-ai-control.module';
import { AdminGrowthModule } from './growth/admin-growth.module';
import { AdminFounderModule } from './founder/admin-founder.module';
import { AdminIntegrationsModule } from './integrations/admin-integrations.module';
import { AdminAuditExplorerModule } from './audit-explorer/admin-audit-explorer.module';
import { AdminSettingsModule } from './settings/admin-settings.module';

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
    AdminOperationsModule,
    AdminMarketplaceModule,
    AdminAiControlModule,
    AdminGrowthModule,
    AdminFounderModule,
    AdminIntegrationsModule,
    AdminAuditExplorerModule,
    AdminSettingsModule,
  ],
})
export class AdminModule {}
