import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ReportInterpretation,
  ReportInterpretationSchema,
} from './schemas/report-interpretation.schema';
import {
  MedicalRecord,
  MedicalRecordSchema,
} from '../../core/records/schemas/medical-record.schema';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import {
  AiSurfaceConfig,
  AiSurfaceConfigSchema,
} from '../../admin/ai-control/schemas/ai-surface-config.schema';
import { ReportInterpreterController } from './report-interpreter.controller';
import { ReportInterpreterService } from './report-interpreter.service';
import { AuthModule } from '../../auth/auth.module';
import { AiInteractionLogModule } from '../ai-interaction-log/ai-interaction-log.module';

/**
 * Report Interpreter endpoints (TRD §4.4, §5.3) — MOCK plain-language
 * interpretation (docs/AI_INTEGRATION_CONTRACT.md).
 */
@Module({
  imports: [
    AuthModule,
    AiInteractionLogModule,
    MongooseModule.forFeature([
      { name: ReportInterpretation.name, schema: ReportInterpretationSchema },
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: User.name, schema: UserSchema },
      // Read-only: the live prompt version and any compliance holds.
      { name: AiSurfaceConfig.name, schema: AiSurfaceConfigSchema },
    ]),
  ],
  controllers: [ReportInterpreterController],
  providers: [ReportInterpreterService],
  exports: [MongooseModule],
})
export class ReportInterpreterModule {}
