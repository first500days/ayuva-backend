import { Module } from '@nestjs/common';
import { AiInteractionLogModule } from './ai-interaction-log/ai-interaction-log.module';
import { SymptomNavModule } from './symptom-nav/symptom-nav.module';
import { CareJourneyModule } from './care-journey/care-journey.module';
import { ReportInterpreterModule } from './report-interpreter/report-interpreter.module';

/**
 * AI Service domain (TRD §1): symptom navigation, care journey generation,
 * report interpretation. Intentionally decoupled from the Core domain so it
 * can scale and ship independently (NFR-7) — kept as its own module tree
 * even while both run in one deployable for now.
 */
@Module({
  imports: [
    AiInteractionLogModule,
    SymptomNavModule,
    CareJourneyModule,
    ReportInterpreterModule,
  ],
})
export class AiModule {}
