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
import { AdminOperationsModule } from '../operations/admin-operations.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import {
  AuditLog,
  AuditLogSchema,
} from '../../audit-log/schemas/audit-log.schema';
import { Lab, LabSchema } from '../../core/labs/schemas/lab.schema';
import {
  Hospital,
  HospitalSchema,
} from '../../core/hospitals/schemas/hospital.schema';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { HealthCheckService } from './health-checks/health-check.service';

@Module({
  imports: [
    AuthModule,
    AdminOperationsModule,
    AuditLogModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: AppointmentSlot.name, schema: AppointmentSlotSchema },
      { name: AIInteractionLog.name, schema: AIInteractionLogSchema },
      { name: ReportInterpretation.name, schema: ReportInterpretationSchema },
      { name: Medication.name, schema: MedicationSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: Lab.name, schema: LabSchema },
      { name: Hospital.name, schema: HospitalSchema },
    ]),
  ],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService, HealthCheckService],
  exports: [AdminAnalyticsService, HealthCheckService],
})
export class AdminAnalyticsModule {}