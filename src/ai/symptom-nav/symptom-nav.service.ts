import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SymptomEntry, SymptomEntryDocument } from './schemas/symptom-entry.schema';
import {
  RecommendedCareLevel,
  RiskLevel,
  TriageResult,
  TriageResultDocument,
  Urgency,
} from './schemas/triage-result.schema';
import { HealthProfile, HealthProfileDocument } from '../../core/health-profile/schemas/health-profile.schema';
import { CreateSymptomEntryDto } from './dto/create-symptom-entry.dto';
import { SymptomNavResponseDto } from './dto/symptom-nav-response.dto';
import { AiInteractionLogService } from '../ai-interaction-log/ai-interaction-log.service';
import { AiService } from '../ai-interaction-log/schemas/ai-interaction-log.schema';
import { AiSource } from '../common/ai-source.enum';
import { AI_DISCLAIMER } from '../common/ai-disclaimer.constant';

const RULES_VERSION = 'mock-rules-v1';

// Deterministic keyword heuristics standing in for the real NLU + clinical
// rules engine (TRD §5, §6) — never a diagnosis, only a navigation signal.
const EMERGENCY_KEYWORDS = [
  'crushing chest',
  "can't breathe",
  'cannot breathe',
  'severe bleeding',
  'unconscious',
  'unresponsive',
  'stroke',
  'suicidal',
  'suicide',
  'seizure',
  'anaphylaxis',
  'severe allergic',
  'coughing blood',
  'blue lips',
  'chest pain',
];

const PRIORITY_KEYWORDS = [
  'fever',
  'persistent',
  'worsening',
  'severe pain',
  'shortness of breath',
  'dizzy',
  'dizziness',
  'vomiting',
  'blood in',
  'swelling',
  'infection',
  'faint',
];

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'i',
  'my',
  'me',
  'have',
  'has',
  'had',
  'am',
  'is',
  'are',
  'been',
  'with',
  'when',
  'while',
  'that',
  'this',
  'it',
  'to',
  'of',
  'in',
  'on',
  'at',
  'for',
]);

@Injectable()
export class SymptomNavService {
  constructor(
    @InjectModel(SymptomEntry.name)
    private readonly symptomEntryModel: Model<SymptomEntryDocument>,
    @InjectModel(TriageResult.name)
    private readonly triageResultModel: Model<TriageResultDocument>,
    @InjectModel(HealthProfile.name)
    private readonly healthProfileModel: Model<HealthProfileDocument>,
    private readonly aiInteractionLogService: AiInteractionLogService,
  ) {}

  async analyse(
    userId: string,
    dto: CreateSymptomEntryDto,
  ): Promise<SymptomNavResponseDto> {
    const startedAt = Date.now();

    // Optional patient profile context (TRD §6 input spec) — used to nudge
    // the mock urgency, not to diagnose. Absent profile is a normal case.
    const healthProfile = await this.healthProfileModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();

    const extractedSymptoms = this.extractSymptoms(dto.rawText);
    const { urgency, riskLevel, recommendedCareLevel } = this.classify(
      dto.rawText,
      dto.durationDays,
      healthProfile?.conditions ?? [],
    );

    const symptomEntry = await this.symptomEntryModel.create({
      userId: new Types.ObjectId(userId),
      rawText: dto.rawText,
      durationDays: dto.durationDays,
      extractedSymptoms,
    });

    const triageResult = await this.triageResultModel.create({
      symptomEntryId: symptomEntry._id,
      understoodSymptoms: extractedSymptoms,
      urgency,
      riskLevel,
      recommendedCareLevel,
      rulesVersion: RULES_VERSION,
    });

    const response: SymptomNavResponseDto = {
      symptomEntryId: symptomEntry.id,
      triageResultId: triageResult.id,
      extractedSymptoms,
      understoodSymptoms: extractedSymptoms,
      urgency,
      riskLevel,
      recommendedCareLevel,
      rulesVersion: RULES_VERSION,
      source: AiSource.MOCK,
      disclaimer: AI_DISCLAIMER,
    };

    await this.aiInteractionLogService.record({
      userId,
      service: AiService.SYMPTOM_NAV,
      input: { rawText: dto.rawText, durationDays: dto.durationDays },
      outcome: {
        urgency,
        riskLevel,
        recommendedCareLevel,
        extractedSymptoms,
      },
      latencyMs: Date.now() - startedAt,
      source: AiSource.MOCK,
      flagged: riskLevel !== RiskLevel.LOW,
    });

    return response;
  }

  async findOne(userId: string, triageResultId: string): Promise<SymptomNavResponseDto> {
    if (!Types.ObjectId.isValid(triageResultId)) {
      throw new NotFoundException('Triage result not found');
    }
    const triageResult = await this.triageResultModel.findById(triageResultId);
    if (!triageResult) {
      throw new NotFoundException('Triage result not found');
    }
    const symptomEntry = await this.symptomEntryModel.findOne({
      _id: triageResult.symptomEntryId,
      userId: new Types.ObjectId(userId),
    });
    if (!symptomEntry) {
      throw new NotFoundException('Triage result not found');
    }

    return {
      symptomEntryId: symptomEntry.id,
      triageResultId: triageResult.id,
      extractedSymptoms: symptomEntry.extractedSymptoms,
      understoodSymptoms: triageResult.understoodSymptoms,
      urgency: triageResult.urgency,
      riskLevel: triageResult.riskLevel,
      recommendedCareLevel: triageResult.recommendedCareLevel,
      rulesVersion: triageResult.rulesVersion,
      source: AiSource.MOCK,
      disclaimer: AI_DISCLAIMER,
    };
  }

  private extractSymptoms(rawText: string): string[] {
    const phrases = rawText
      .split(/[,.;]| and | while | when /gi)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const cleaned = phrases
      .map((p) =>
        p
          .split(' ')
          .filter((w) => !STOPWORDS.has(w.toLowerCase()))
          .join(' ')
          .trim(),
      )
      .filter((p) => p.length > 2)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1));

    const deduped = Array.from(new Set(cleaned)).slice(0, 6);
    return deduped.length > 0 ? deduped : ['General symptoms as described'];
  }

  private classify(
    rawText: string,
    durationDays: number,
    existingConditions: string[],
  ): {
    urgency: Urgency;
    riskLevel: RiskLevel;
    recommendedCareLevel: RecommendedCareLevel;
  } {
    const text = rawText.toLowerCase();
    const hasEmergency = EMERGENCY_KEYWORDS.some((k) => text.includes(k));
    const hasPriority = PRIORITY_KEYWORDS.some((k) => text.includes(k));
    const isChronic = durationDays >= 14;
    const hasExistingConditions = existingConditions.length > 0;

    if (hasEmergency) {
      return {
        urgency: Urgency.EMERGENCY,
        riskLevel: RiskLevel.HIGH,
        recommendedCareLevel: RecommendedCareLevel.EMERGENCY_ROOM,
      };
    }

    if (hasPriority) {
      const riskLevel =
        hasExistingConditions || isChronic ? RiskLevel.HIGH : RiskLevel.MODERATE_HIGH;
      const recommendedCareLevel =
        riskLevel === RiskLevel.HIGH
          ? RecommendedCareLevel.URGENT_CARE
          : RecommendedCareLevel.SPECIALIST;
      return { urgency: Urgency.PRIORITY, riskLevel, recommendedCareLevel };
    }

    if (isChronic || hasExistingConditions) {
      return {
        urgency: Urgency.PRIORITY,
        riskLevel: RiskLevel.MODERATE_HIGH,
        recommendedCareLevel: RecommendedCareLevel.SPECIALIST,
      };
    }

    return {
      urgency: Urgency.ROUTINE,
      riskLevel: RiskLevel.LOW,
      recommendedCareLevel:
        durationDays <= 2 ? RecommendedCareLevel.SELF_CARE : RecommendedCareLevel.GP,
    };
  }
}
