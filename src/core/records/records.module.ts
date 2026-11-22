import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from './schemas/medical-record.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../appointments/schemas/appointment.schema';
import {
  ReportInterpretation,
  ReportInterpretationSchema,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { LabTrendsService } from './lab-trends.service';
import { ScanExplainService } from './scan-explain.service';
import { ScanViewKeysService } from './scan-view-keys.service';
import { ScanViewController } from './scan-view.controller';
import {
  ConsultationNote,
  ConsultationNoteSchema,
} from '../../partner/clinical/schemas/consultation-note.schema';
import { AiInteractionLogModule } from '../../ai/ai-interaction-log/ai-interaction-log.module';
import {
  LabResult,
  LabResultSchema,
} from '../../partner/lab/schemas/lab-result.schema';
import { Provider, ProviderSchema } from '../providers/schemas/provider.schema';
import { AuthModule } from '../../auth/auth.module';
import { StorageModule } from '../../storage/storage.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    AuditLogModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: ReportInterpretation.name, schema: ReportInterpretationSchema },
      { name: User.name, schema: UserSchema },
      { name: LabResult.name, schema: LabResultSchema },
      { name: Provider.name, schema: ProviderSchema },
      { name: ConsultationNote.name, schema: ConsultationNoteSchema },
    ]),
    AiInteractionLogModule,
    JwtModule.register({}),
  ],
  controllers: [RecordsController, ScanViewController],
  providers: [
    RecordsService,
    LabTrendsService,
    ScanExplainService,
    ScanViewKeysService,
  ],
  exports: [MongooseModule, RecordsService],
})
export class RecordsModule {}
