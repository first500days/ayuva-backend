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
import {
  HealthProfile,
  HealthProfileSchema,
} from '../../core/health-profile/schemas/health-profile.schema';
import { SymptomNavController } from './symptom-nav.controller';
import { SymptomNavService } from './symptom-nav.service';
import { AuthModule } from '../../auth/auth.module';
import { AiInteractionLogModule } from '../ai-interaction-log/ai-interaction-log.module';

/**
 * POST /symptom-nav/analyse (TRD §4.2, §5.1) — MOCK NLU extraction + rules
 * mapping (docs/AI_INTEGRATION_CONTRACT.md). Real engine is a separate team's
 * drop-in replacement for SymptomNavService's internals.
 */
@Module({
  imports: [
    AuthModule,
    AiInteractionLogModule,
    MongooseModule.forFeature([
      { name: SymptomEntry.name, schema: SymptomEntrySchema },
      { name: TriageResult.name, schema: TriageResultSchema },
      { name: HealthProfile.name, schema: HealthProfileSchema },
    ]),
  ],
  controllers: [SymptomNavController],
  providers: [SymptomNavService],
  exports: [MongooseModule],
})
export class SymptomNavModule {}
