import { ApiProperty } from '@nestjs/swagger';
import { HighlightedValueStatus, ReportAiStatus } from '../schemas/report-interpretation.schema';
import { AiSource } from '../../common/ai-source.enum';

export class HighlightedValueResponseDto {
  @ApiProperty({ example: 'Hemoglobin' })
  label: string;

  @ApiProperty({ example: '11.2 g/dL' })
  value: string;

  @ApiProperty({ enum: HighlightedValueStatus })
  status: HighlightedValueStatus;
}

export class GlossaryTermResponseDto {
  @ApiProperty({ example: 'Hemoglobin' })
  term: string;

  @ApiProperty({
    example: 'The protein in red blood cells that carries oxygen around your body.',
  })
  definition: string;
}

export class ReportInterpretationResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7bb' })
  id: string;

  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7b8' })
  recordId: string;

  @ApiProperty({
    example:
      'This blood panel checks how your body is functioning overall. Most values are within the expected range; one is flagged below for you to discuss with your provider.',
  })
  summaryText: string;

  @ApiProperty({ type: [HighlightedValueResponseDto] })
  highlightedValues: HighlightedValueResponseDto[];

  @ApiProperty({ type: [GlossaryTermResponseDto] })
  glossaryTerms: GlossaryTermResponseDto[];

  @ApiProperty({
    type: [String],
    example: ['What does a slightly low hemoglobin reading mean for me?'],
  })
  suggestedQuestions: string[];

  @ApiProperty({ enum: ReportAiStatus })
  aiStatus: ReportAiStatus;

  @ApiProperty({ enum: AiSource, example: AiSource.MOCK })
  source: AiSource;

  @ApiProperty({
    example:
      'AYUVA provides healthcare navigation, document organization, and information simplification only. AYUVA does not provide medical advice, diagnosis, treatment recommendations, or emergency guidance. Always consult a qualified healthcare professional.',
  })
  disclaimer: string;
}
