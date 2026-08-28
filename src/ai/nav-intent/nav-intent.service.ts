import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NavIntent, NavIntentDocument } from './schemas/nav-intent.schema';
import {
  AnalyseNavIntentDto,
  NavIntentResponseDto,
  NavActionDto,
  SuggestedFiltersDto,
} from './dto/nav-intent.dto';
import { AiSource } from '../common/ai-source.enum';
import { AI_DISCLAIMER } from '../common/ai-disclaimer.constant';

interface KeywordRule {
  keywords: string[];
  specialty?: string;
  type?: string;
  availability?: 'today' | 'tomorrow' | 'this_week';
  understood: string[];
  summary: string;
  primaryAction: NavActionDto;
  relatedTests: { id: string; name: string; fromPrice: number }[];
}

// MOCK keyword-based intent classifier — stands in for real NLU (TRD §6)
const INTENT_RULES: KeywordRule[] = [
  {
    keywords: ['heart', 'chest', 'cardiac', 'cardiolog'],
    specialty: 'Cardiologist',
    availability: 'today',
    understood: ['Cardiac symptoms', 'Needs specialist consultation'],
    summary: 'You may want to see a cardiologist. I found specialists available today.',
    primaryAction: {
      id: 'act_providers',
      label: 'Find Cardiologists',
      description: 'Browse available cardiologists near you',
      icon: 'favorite',
      route: '/(tabs)/explore',
      params: { specialty: 'Cardiologist', availability: 'today' },
      kind: 'marketplace',
      primary: true,
    },
    relatedTests: [{ id: 'ecg', name: 'ECG / EKG', fromPrice: 450 }],
  },
  {
    keywords: ['blood test', 'blood report', 'cbc', 'haemoglobin', 'hemoglobin'],
    understood: ['Blood test needed'],
    summary: "I can help you book a blood test at a lab near you.",
    primaryAction: {
      id: 'act_tests',
      label: 'Book Blood Test',
      description: 'Find labs offering blood tests',
      icon: 'science',
      route: '/tests',
      params: { category: 'blood' },
      kind: 'tests',
      primary: true,
    },
    relatedTests: [{ id: 'cbc', name: 'Complete Blood Count (CBC)', fromPrice: 200 }],
  },
  {
    keywords: ['skin', 'dermatolog', 'rash', 'acne', 'eczema'],
    specialty: 'Dermatologist',
    understood: ['Skin-related concern', 'Dermatology referral'],
    summary: 'I found dermatologists you can consult.',
    primaryAction: {
      id: 'act_derm',
      label: 'Find Dermatologists',
      description: 'Browse dermatologists near you',
      icon: 'person-search',
      route: '/(tabs)/explore',
      params: { specialty: 'Dermatologist' },
      kind: 'marketplace',
      primary: true,
    },
    relatedTests: [],
  },
  {
    keywords: ['fever', 'cold', 'flu', 'general', 'gp', 'doctor'],
    specialty: 'General Physician',
    availability: 'today',
    understood: ['General health concern', 'GP consultation recommended'],
    summary: 'I found general physicians available for a consultation.',
    primaryAction: {
      id: 'act_gp',
      label: 'Find GPs',
      description: 'Browse general physicians near you',
      icon: 'local-hospital',
      route: '/(tabs)/explore',
      params: { specialty: 'General Physician', availability: 'today' },
      kind: 'marketplace',
      primary: true,
    },
    relatedTests: [],
  },
];

const DEFAULT_RULE: Omit<KeywordRule, 'keywords'> = {
  understood: ['Health query received'],
  summary: 'I can help you find providers, book tests, or navigate your records.',
  primaryAction: {
    id: 'act_explore',
    label: 'Explore Providers',
    description: 'Search for providers by specialty',
    icon: 'search',
    route: '/(tabs)/explore',
    kind: 'marketplace',
    primary: true,
  },
  relatedTests: [],
};

@Injectable()
export class NavIntentService {
  constructor(
    @InjectModel(NavIntent.name)
    private readonly navIntentModel: Model<NavIntentDocument>,
  ) {}

  async analyse(userId: string, dto: AnalyseNavIntentDto): Promise<NavIntentResponseDto> {
    const text = dto.rawText.toLowerCase();
    const rule = INTENT_RULES.find((r) => r.keywords.some((k) => text.includes(k))) ?? null;

    const understood = rule?.understood ?? DEFAULT_RULE.understood;
    const summary = rule?.summary ?? DEFAULT_RULE.summary;
    const primaryAction = rule?.primaryAction ?? DEFAULT_RULE.primaryAction;
    const relatedTests = rule?.relatedTests ?? [];

    const suggestedFilters: SuggestedFiltersDto = {
      label: rule?.specialty ? `${rule.specialty} — near you` : 'Providers near you',
      specialty: rule?.specialty,
      availability: rule?.availability,
    };

    const suggestedActions: NavActionDto[] = [
      primaryAction,
      {
        id: 'act_chat',
        label: 'Ask AYUVA AI',
        description: 'Chat with the AYUVA assistant for guidance',
        icon: 'chat',
        route: '/chat',
        kind: 'chat',
      },
    ];

    const saved = await this.navIntentModel.create({
      userId: new Types.ObjectId(userId),
      rawText: dto.rawText,
      understood,
      summary,
      suggestedFilters: suggestedFilters as unknown as Record<string, unknown>,
      suggestedActions: suggestedActions as unknown as Record<string, unknown>[],
      relatedTests: relatedTests as unknown as Record<string, unknown>[],
    });

    return this.toResponse(saved, understood, summary, suggestedFilters, suggestedActions, relatedTests);
  }

  async findOne(userId: string, id: string): Promise<NavIntentResponseDto> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Intent not found');
    const intent = await this.navIntentModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });
    if (!intent) throw new NotFoundException('Intent not found');
    return this.toResponse(
      intent,
      intent.understood,
      intent.summary,
      intent.suggestedFilters as unknown as SuggestedFiltersDto,
      intent.suggestedActions as unknown as NavActionDto[],
      intent.relatedTests as unknown as { id: string; name: string; fromPrice: number }[],
    );
  }

  private toResponse(
    intent: NavIntentDocument,
    understood: string[],
    summary: string,
    suggestedFilters: SuggestedFiltersDto,
    suggestedActions: NavActionDto[],
    relatedTests: { id: string; name: string; fromPrice: number }[],
  ): NavIntentResponseDto {
    return {
      id: intent.id,
      understood,
      summary,
      suggestedFilters,
      suggestedActions,
      relatedTests,
      source: AiSource.MOCK,
      disclaimer: AI_DISCLAIMER,
    };
  }
}
