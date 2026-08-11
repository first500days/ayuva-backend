import { Module } from '@nestjs/common';
import { AiInteractionLogModule } from './ai-interaction-log/ai-interaction-log.module';
import { SymptomNavModule } from './symptom-nav/symptom-nav.module';
import { CareJourneyModule } from './care-journey/care-journey.module';
import { ReportInterpreterModule } from './report-interpreter/report-interpreter.module';
import { AssistantModule } from './assistant/assistant.module';

/**
 * AI Service domain (TRD §1): symptom navigation, care journey generation,
 * report interpretation, conversational assistant. Intentionally decoupled
 * from the Core domain so it can scale and ship independently (NFR-7) — kept
 * as its own module tree even while both run in one deployable for now.
 *
 * Every endpoint here is a MOCK implementation of the contract documented in
 * docs/AI_INTEGRATION_CONTRACT.md — the real AI/LLM logic is owned by a
 * separate team and is a drop-in replacement for these services' internals.
 */
@Module({
  imports: [
    AiInteractionLogModule,
    SymptomNavModule,
    CareJourneyModule,
    ReportInterpreterModule,
    AssistantModule,
  ],
})
export class AiModule {}
