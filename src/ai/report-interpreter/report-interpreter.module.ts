import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ReportInterpretation,
  ReportInterpretationSchema,
} from './schemas/report-interpretation.schema';

/** Schema registration only. Report Interpreter endpoints (TRD §4.4, §5.3) land in Phase 2. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReportInterpretation.name, schema: ReportInterpretationSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class ReportInterpreterModule {}
