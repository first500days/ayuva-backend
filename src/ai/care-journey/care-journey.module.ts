import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CareJourney, CareJourneySchema } from './schemas/care-journey.schema';
import {
  TriageResult,
  TriageResultSchema,
} from '../symptom-nav/schemas/triage-result.schema';
import {
  SymptomEntry,
  SymptomEntrySchema,
} from '../symptom-nav/schemas/symptom-entry.schema';
import { CareJourneyController } from './care-journey.controller';
import { CareJourneyService } from './care-journey.service';
import { AuthModule } from '../../auth/auth.module';
import { AiInteractionLogModule } from '../ai-interaction-log/ai-interaction-log.module';

/**
 * Care Journey endpoints (TRD §4.2, §5.2) — MOCK pathway generation
 * (docs/AI_INTEGRATION_CONTRACT.md); step-progress updates are real state.
 */
@Module({
  imports: [
    AuthModule,
    AiInteractionLogModule,
    MongooseModule.forFeature([
      { name: CareJourney.name, schema: CareJourneySchema },
      { name: TriageResult.name, schema: TriageResultSchema },
      { name: SymptomEntry.name, schema: SymptomEntrySchema },
    ]),
  ],
  controllers: [CareJourneyController],
  providers: [CareJourneyService],
  exports: [MongooseModule],
})
export class CareJourneyModule {}
