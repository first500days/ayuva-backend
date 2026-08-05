import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  SymptomEntry,
  SymptomEntrySchema,
} from './schemas/symptom-entry.schema';
import {
  TriageResult,
  TriageResultSchema,
} from './schemas/triage-result.schema';

/**
 * Schema registration only. POST /symptom-nav/analyse (TRD §4.2, §5.1) —
 * NLU extraction + versioned clinical rules mapping — lands in Phase 2.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SymptomEntry.name, schema: SymptomEntrySchema },
      { name: TriageResult.name, schema: TriageResultSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class SymptomNavModule {}
