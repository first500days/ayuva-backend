import { Injectable } from '@nestjs/common';
import { ChatRequestDto } from './dto/chat-request.dto';
import { AssistantResponseScope, ChatResponseDto } from './dto/chat-response.dto';
import { AiInteractionLogService } from '../ai-interaction-log/ai-interaction-log.service';
import { AiService } from '../ai-interaction-log/schemas/ai-interaction-log.schema';
import { AiSource } from '../common/ai-source.enum';
import { AI_DISCLAIMER } from '../common/ai-disclaimer.constant';

// Keyword heuristic standing in for real intent classification (TRD §6) —
// anything that reads as a request for diagnosis/treatment must be redirected,
// never answered, regardless of how the real model would later handle it.
const CLINICAL_KEYWORDS = [
  'diagnose',
  'diagnosis',
  'what disease',
  'what condition',
  'do i have',
  'am i having a',
  'what medicine',
  'what medication',
  'which drug',
  'dosage',
  'prescribe',
  'prescription for',
  'is this cancer',
  'am i dying',
  'treatment for',
  'cure for',
];

const ORGANIZATIONAL_REPLIES = [
  "You can book a specialist from the Providers tab — search by specialty, then pick an open slot.",
  "Your uploaded reports live in the Records vault — tap any record to see its plain-language summary once it's interpreted.",
  "I can help you navigate the app — book appointments, find providers, organize records, and set medication reminders. What would you like to do?",
  "You can set up medication reminders from the Medications tab — add a schedule and I'll keep track of doses and refills.",
  "Your care journey shows the steps ahead of you — check the Journey tab to see what's next and mark steps as done.",
];

const CLINICAL_REDIRECT_REPLY =
  "I can't answer clinical questions like that — please consult a qualified healthcare professional. If you'd like, I can help you start a symptom navigation to find the right type of care, or find a provider near you.";

@Injectable()
export class AssistantService {
  constructor(private readonly aiInteractionLogService: AiInteractionLogService) {}

  async chat(userId: string, dto: ChatRequestDto): Promise<ChatResponseDto> {
    const startedAt = Date.now();
    const text = dto.message.toLowerCase();
    const soundsClinical = CLINICAL_KEYWORDS.some((k) => text.includes(k));

    const response: ChatResponseDto = soundsClinical
      ? {
          reply: CLINICAL_REDIRECT_REPLY,
          scope: AssistantResponseScope.CLINICAL_REDIRECT,
          source: AiSource.MOCK,
          disclaimer: AI_DISCLAIMER,
        }
      : {
          reply: this.pickOrganizationalReply(dto.message),
          scope: AssistantResponseScope.ORGANIZATIONAL,
          source: AiSource.MOCK,
          disclaimer: AI_DISCLAIMER,
        };

    await this.aiInteractionLogService.record({
      userId,
      service: AiService.ASSISTANT,
      input: { message: dto.message },
      outcome: { scope: response.scope, reply: response.reply },
      latencyMs: Date.now() - startedAt,
      source: AiSource.MOCK,
      flagged: soundsClinical,
    });

    return response;
  }

  private pickOrganizationalReply(message: string): string {
    const idx = this.hashToIndex(message, ORGANIZATIONAL_REPLIES.length);
    return ORGANIZATIONAL_REPLIES[idx];
  }

  private hashToIndex(seed: string, mod: number): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) % 2147483647;
    }
    return mod > 0 ? Math.abs(hash) % mod : 0;
  }
}
