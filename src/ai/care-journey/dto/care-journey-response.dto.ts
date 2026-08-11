import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CareJourneyStatus, CareStepStatus } from '../schemas/care-journey.schema';
import { AiSource } from '../../common/ai-source.enum';

export class CareStepResponseDto {
  @ApiProperty({ example: 'Book GP Appointment' })
  name: string;

  @ApiProperty({ enum: CareStepStatus })
  status: CareStepStatus;

  @ApiPropertyOptional({ example: 'Bring a list of your current medications.' })
  contextNote?: string;
}

export class CareJourneyResponseDto {
  @ApiProperty({ example: '64f0c8e2b1a2c3d4e5f6a7ba' })
  id: string;

  @ApiPropertyOptional({ example: '64f0c8e2b1a2c3d4e5f6a7b9' })
  triageResultId?: string;

  @ApiProperty({ example: 'Care Journey — Specialist Consultation' })
  title: string;

  @ApiProperty({ type: [CareStepResponseDto] })
  steps: CareStepResponseDto[];

  @ApiProperty({ example: 25 })
  progressPct: number;

  @ApiProperty({ enum: CareJourneyStatus })
  status: CareJourneyStatus;

  @ApiProperty({
    example: 14,
    description: 'Rough end-to-end timeline estimate in days, derived from step count',
  })
  timelineEstimateDays: number;

  @ApiProperty({ enum: AiSource, example: AiSource.MOCK })
  source: AiSource;

  @ApiProperty({
    example:
      'AYUVA provides healthcare navigation, document organization, and information simplification only. AYUVA does not provide medical advice, diagnosis, treatment recommendations, or emergency guidance. Always consult a qualified healthcare professional.',
  })
  disclaimer: string;
}
