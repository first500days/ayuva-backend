import { ApiProperty } from '@nestjs/swagger';
import { AiSource } from '../../common/ai-source.enum';

export enum AssistantResponseScope {
  ORGANIZATIONAL = 'organizational',
  CLINICAL_REDIRECT = 'clinical_redirect',
}

export class ChatResponseDto {
  @ApiProperty({
    example:
      "You can book a specialist from the Providers tab — search by specialty, then pick an open slot.",
  })
  reply: string;

  @ApiProperty({
    enum: AssistantResponseScope,
    description:
      'organizational = answered directly; clinical_redirect = query sounded clinical, redirected to a professional (PRD §6)',
  })
  scope: AssistantResponseScope;

  @ApiProperty({ enum: AiSource, example: AiSource.MOCK })
  source: AiSource;

  @ApiProperty({
    example:
      'AYUVA provides healthcare navigation, document organization, and information simplification only. AYUVA does not provide medical advice, diagnosis, treatment recommendations, or emergency guidance. Always consult a qualified healthcare professional.',
  })
  disclaimer: string;
}
