import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FeedbackItem,
  FeedbackItemSchema,
} from '../../core/feedback/schemas/feedback-item.schema';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import {
  AIInteractionLog,
  AIInteractionLogSchema,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import {
  ReportInterpretation,
  ReportInterpretationSchema,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AdminAiControlModule } from '../ai-control/admin-ai-control.module';
import { AdminOperationsModule } from '../operations/admin-operations.module';
import { AdminFeedbackController } from './admin-feedback.controller';
import { AdminFeedbackService } from './admin-feedback.service';
import { AdminFeedbackComplianceService } from './admin-feedback-compliance.service';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    NotificationsModule,
    // Compliance escalation pauses prompts and opens an Operations Desk incident.
    AdminAiControlModule,
    AdminOperationsModule,
    MongooseModule.forFeature([
      { name: FeedbackItem.name, schema: FeedbackItemSchema },
      { name: User.name, schema: UserSchema },
      { name: AIInteractionLog.name, schema: AIInteractionLogSchema },
      { name: ReportInterpretation.name, schema: ReportInterpretationSchema },
    ]),
  ],
  controllers: [AdminFeedbackController],
  providers: [AdminFeedbackService, AdminFeedbackComplianceService],
})
export class AdminFeedbackModule {}
