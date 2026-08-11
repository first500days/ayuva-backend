import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CareJourney,
  CareJourneyDocument,
  CareJourneyStatus,
  CareStep,
  CareStepStatus,
} from './schemas/care-journey.schema';
import {
  RecommendedCareLevel,
  TriageResult,
  TriageResultDocument,
} from '../symptom-nav/schemas/triage-result.schema';
import {
  SymptomEntry,
  SymptomEntryDocument,
} from '../symptom-nav/schemas/symptom-entry.schema';
import { GenerateCareJourneyDto } from './dto/generate-care-journey.dto';
import { UpdateCareStepDto } from './dto/update-care-step.dto';
import { CareJourneyResponseDto } from './dto/care-journey-response.dto';
import { AiInteractionLogService } from '../ai-interaction-log/ai-interaction-log.service';
import { AiService } from '../ai-interaction-log/schemas/ai-interaction-log.schema';
import { AiSource } from '../common/ai-source.enum';
import { AI_DISCLAIMER } from '../common/ai-disclaimer.constant';

// Deterministic pathway templates keyed by recommended care tier (TRD §5.2) —
// stands in for the real Care Journey Generator's model output.
const JOURNEY_TEMPLATES: Record<
  RecommendedCareLevel,
  { title: string; steps: Array<{ name: string; contextNote: string }> }
> = {
  [RecommendedCareLevel.SELF_CARE]: {
    title: 'Care Journey — Self Care',
    steps: [
      { name: 'Rest & Monitor', contextNote: 'Track symptoms daily; note any changes.' },
      { name: 'Self-Care Measures', contextNote: 'Hydration, rest, and over-the-counter comfort measures as appropriate.' },
      { name: 'Follow-up if Symptoms Persist', contextNote: 'Book a GP visit if symptoms continue beyond a few days.' },
    ],
  },
  [RecommendedCareLevel.GP]: {
    title: 'Care Journey — GP Consultation',
    steps: [
      { name: 'Book GP Appointment', contextNote: 'Bring a list of your current medications and symptom timeline.' },
      { name: 'GP Consultation', contextNote: 'Describe onset, duration, and severity clearly.' },
      { name: 'Possible Referral', contextNote: 'Your GP may refer you onward based on findings.' },
      { name: 'Follow-up', contextNote: 'Schedule a follow-up to confirm improvement.' },
    ],
  },
  [RecommendedCareLevel.SPECIALIST]: {
    title: 'Care Journey — Specialist Consultation',
    steps: [
      { name: 'GP Referral', contextNote: 'Obtain a referral letter and any prior test results.' },
      { name: 'Specialist Consultation', contextNote: 'Prepare a list of questions for the specialist.' },
      { name: 'Diagnostic Tests', contextNote: 'Complete any tests the specialist orders.' },
      { name: 'Treatment Plan', contextNote: 'Review the plan and confirm next steps.' },
      { name: 'Follow-up', contextNote: 'Book a follow-up to review test results.' },
    ],
  },
  [RecommendedCareLevel.URGENT_CARE]: {
    title: 'Care Journey — Urgent Care',
    steps: [
      { name: 'Urgent Care Visit', contextNote: 'Go to an urgent care centre today — do not wait for a routine slot.' },
      { name: 'Diagnostic Assessment', contextNote: 'Clinicians will assess and may order immediate tests.' },
      { name: 'Treatment', contextNote: 'Follow the care team\'s immediate treatment instructions.' },
      { name: 'Follow-up within 48h', contextNote: 'Arrange a short-interval follow-up to confirm you are improving.' },
    ],
  },
  [RecommendedCareLevel.EMERGENCY_ROOM]: {
    title: 'Care Journey — Emergency Care',
    steps: [
      { name: 'Seek Emergency Care Immediately', contextNote: 'Go to the nearest emergency department or call local emergency services now.' },
      { name: 'Emergency Assessment', contextNote: 'Emergency staff will triage and assess you immediately.' },
      { name: 'Stabilization', contextNote: 'Follow the emergency team\'s instructions.' },
      { name: 'Specialist Referral if Needed', contextNote: 'You may be referred onward once stabilized.' },
    ],
  },
};

const AVG_DAYS_PER_STEP = 3;

@Injectable()
export class CareJourneyService {
  constructor(
    @InjectModel(CareJourney.name)
    private readonly careJourneyModel: Model<CareJourneyDocument>,
    @InjectModel(TriageResult.name)
    private readonly triageResultModel: Model<TriageResultDocument>,
    @InjectModel(SymptomEntry.name)
    private readonly symptomEntryModel: Model<SymptomEntryDocument>,
    private readonly aiInteractionLogService: AiInteractionLogService,
  ) {}

  async generate(
    userId: string,
    dto: GenerateCareJourneyDto,
  ): Promise<CareJourneyResponseDto> {
    const startedAt = Date.now();

    const triageResult = await this.getOwnedTriageResultOrThrow(
      userId,
      dto.triageResultId,
    );

    const template = JOURNEY_TEMPLATES[triageResult.recommendedCareLevel];
    const steps: CareStep[] = template.steps.map((s, i) => ({
      name: s.name,
      status: i === 0 ? CareStepStatus.CURRENT : CareStepStatus.UPCOMING,
      contextNote: s.contextNote,
    }));

    const journey = await this.careJourneyModel.create({
      userId: new Types.ObjectId(userId),
      triageResultId: triageResult._id,
      title: template.title,
      steps,
      progressPct: 0,
      status: CareJourneyStatus.ACTIVE,
    });

    await this.aiInteractionLogService.record({
      userId,
      service: AiService.CARE_JOURNEY,
      input: { triageResultId: dto.triageResultId },
      outcome: { journeyId: journey.id, stepCount: steps.length },
      latencyMs: Date.now() - startedAt,
      source: AiSource.MOCK,
    });

    return this.toResponse(journey);
  }

  async findOne(userId: string, id: string): Promise<CareJourneyResponseDto> {
    const journey = await this.getOwnedJourneyOrThrow(userId, id);
    return this.toResponse(journey);
  }

  async findActive(userId: string): Promise<CareJourneyResponseDto> {
    const journey = await this.careJourneyModel
      .findOne({ userId: new Types.ObjectId(userId), status: CareJourneyStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .exec();
    if (!journey) {
      throw new NotFoundException('No active care journey found');
    }
    return this.toResponse(journey);
  }

  async updateStep(
    userId: string,
    id: string,
    dto: UpdateCareStepDto,
  ): Promise<CareJourneyResponseDto> {
    const journey = await this.getOwnedJourneyOrThrow(userId, id);

    if (dto.stepIndex >= journey.steps.length) {
      throw new BadRequestException('stepIndex is out of range for this journey');
    }

    journey.steps[dto.stepIndex].status = dto.status;

    // Auto-promote the next upcoming step to current once one is marked done —
    // real persisted progress-tracking state, not AI-generated (PRD Care Journey Generator).
    if (dto.status === CareStepStatus.DONE) {
      const next = journey.steps
        .slice(dto.stepIndex + 1)
        .find((s) => s.status === CareStepStatus.UPCOMING);
      if (next) next.status = CareStepStatus.CURRENT;
    }

    const doneCount = journey.steps.filter((s) => s.status === CareStepStatus.DONE).length;
    journey.progressPct = Math.round((doneCount / journey.steps.length) * 100);
    if (doneCount === journey.steps.length) {
      journey.status = CareJourneyStatus.RESOLVED;
    }

    journey.markModified('steps');
    await journey.save();

    return this.toResponse(journey);
  }

  private async getOwnedTriageResultOrThrow(
    userId: string,
    triageResultId: string,
  ): Promise<TriageResultDocument> {
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
    return triageResult;
  }

  private async getOwnedJourneyOrThrow(
    userId: string,
    id: string,
  ): Promise<CareJourneyDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Care journey not found');
    }
    const journey = await this.careJourneyModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });
    if (!journey) {
      throw new NotFoundException('Care journey not found');
    }
    return journey;
  }

  private toResponse(journey: CareJourneyDocument): CareJourneyResponseDto {
    return {
      id: journey.id,
      triageResultId: journey.triageResultId?.toString(),
      title: journey.title,
      steps: journey.steps.map((s) => ({
        name: s.name,
        status: s.status,
        contextNote: s.contextNote,
      })),
      progressPct: journey.progressPct,
      status: journey.status,
      timelineEstimateDays: journey.steps.length * AVG_DAYS_PER_STEP,
      source: AiSource.MOCK,
      disclaimer: AI_DISCLAIMER,
    };
  }
}
