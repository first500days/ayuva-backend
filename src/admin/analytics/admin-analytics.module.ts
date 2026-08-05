import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../../core/appointments/schemas/appointment.schema';
import {
  AppointmentSlot,
  AppointmentSlotSchema,
} from '../../core/providers/schemas/appointment-slot.schema';
import {
  AIInteractionLog,
  AIInteractionLogSchema,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import {
  ReportInterpretation,
  ReportInterpretationSchema,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import {
  Medication,
  MedicationSchema,
} from '../../core/medications/schemas/medication.schema';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from '../../core/records/schemas/medical-record.schema';
import {
  Provider,
  ProviderSchema,
} from '../../core/providers/schemas/provider.schema';
import { AuthModule } from '../../auth/auth.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: AIInteractionLog.name, schema: AIInteractionLogSchema },
      { name: ReportInterpretation.name, schema: ReportInterpretationSchema },
      { name: Medication.name, schema: MedicationSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: Provider.name, schema: ProviderSchema },
    ]),
  ],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService],
})
export class AdminAnalyticsModule {}
