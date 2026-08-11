import { ApiProperty } from '@nestjs/swagger';
import {
  RecommendedCareLevel,
  RiskLevel,
  Urgency,
} from '../schemas/triage-result.schema';
import { AiSource } from '../../common/ai-source.enum';

export class SymptomNavResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  symptomEntryId: string;

  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  triageResultId: string;

  @ApiProperty({
    type: [String],
    example: ['Chest tightness', 'Shortness of breath'],
    description: 'Symptoms parsed out of the free-text input (FR-4.3)',
  })
  extractedSymptoms: string[];

  @ApiProperty({
    type: [String],
    example: ['Chest tightness', 'Shortness of breath'],
    description: 'Symptoms as understood/confirmed by the navigation engine',
  })
  understoodSymptoms: string[];

  @ApiProperty({ enum: Urgency })
  urgency: Urgency;

  @ApiProperty({ enum: RiskLevel })
  riskLevel: RiskLevel;

  @ApiProperty({
    enum: RecommendedCareLevel,
    description:
      'Exactly one recommended care tier — never a diagnosis or named condition (PRD §6)',
  })
  recommendedCareLevel: RecommendedCareLevel;

  @ApiProperty({ example: 'mock-rules-v1' })
  rulesVersion: string;

  @ApiProperty({ enum: AiSource, example: AiSource.MOCK })
  source: AiSource;

  @ApiProperty({
    example:
      'AYUVA provides healthcare navigation, document organization, and information simplification only. AYUVA does not provide medical advice, diagnosis, treatment recommendations, or emergency guidance. Always consult a qualified healthcare professional.',
  })
  disclaimer: string;
}
