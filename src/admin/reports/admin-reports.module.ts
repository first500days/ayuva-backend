import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from '../../core/records/schemas/medical-record.schema';
import {
  ReportInterpretation,
  ReportInterpretationSchema,
} from '../../ai/report-interpreter/schemas/report-interpretation.schema';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import { AuthModule } from '../../auth/auth.module';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: ReportInterpretation.name, schema: ReportInterpretationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminReportsController],
  providers: [AdminReportsService],
})
export class AdminReportsModule {}
