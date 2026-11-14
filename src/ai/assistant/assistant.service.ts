import { Injectable } from '@nestjs/common';
import { ChatRequestDto } from './dto/chat-request.dto';
import { AssistantResponseScope, ChatResponseDto } from './dto/chat-response.dto';
import { AiInteractionLogService } from '../ai-interaction-log/ai-interaction-log.service';
import { AiService } from '../ai-interaction-log/schemas/ai-interaction-log.schema';
import { ClaudeService } from '../claude/claude.service';
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

const ASSISTANT_SYSTEM_PROMPT = `You are the in-app assistant for Ayuva, a healthcare navigation app. You ONLY help with using the app: booking appointments with providers (Providers tab), the medical records vault (Records tab), medication reminders (Medications tab), care journey steps (Journey tab), and symptom navigation.
You must NEVER diagnose, name conditions, suggest medicines or doses, or interpret symptoms or results. If the user asks anything clinical or about their health condition, set scope to "clinical".
Reply in the user's language, in at most 3 short sentences.
JSON shape: {"scope":"organizational"|"clinical","reply":"<text; empty if clinical>"}`;

@Injectable()
export class AssistantService {
  constructor(
    private readonly aiInteractionLogService: AiInteractionLogService,
    private readonly claude: ClaudeService,
  ) {}

  async chat(userId: string, dto: ChatRequestDto): Promise<ChatResponseDto> {
    const startedAt = Date.now();
    const text = dto.message.toLowerCase();
    const soundsClinical = CLINICAL_KEYWORDS.some((k) => text.includes(k));

    let response: ChatResponseDto = soundsClinical
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

    // The keyword gate above is the safety floor: clinical-sounding messages
    // are never sent to the model. Otherwise Claude answers app-navigation
    // questions and may itself flag a message as clinical.
    if (!soundsClinical && this.claude.isEnabled()) {
      const ai = await this.claude.completeJson<{ scope?: string; reply?: string }>({
        system: ASSISTANT_SYSTEM_PROMPT,
        user: dto.message,
        maxTokens: 400,
      });
      if (ai?.scope === 'clinical') {
        response = {
          reply: CLINICAL_REDIRECT_REPLY,
          scope: AssistantResponseScope.CLINICAL_REDIRECT,
          source: AiSource.REAL,
          disclaimer: AI_DISCLAIMER,
        };
      } else if (ai?.scope === 'organizational' && ai.reply?.trim()) {
        response = {
          reply: ai.reply.trim(),
          scope: AssistantResponseScope.ORGANIZATIONAL,
          source: AiSource.REAL,
          disclaimer: AI_DISCLAIMER,
        };
      }
    }

    await this.aiInteractionLogService.record({
      userId,
      service: AiService.ASSISTANT,
      input: { message: dto.message },
      outcome: { scope: response.scope, reply: response.reply },
      latencyMs: Date.now() - startedAt,
      source: response.source,
      flagged: response.scope === AssistantResponseScope.CLINICAL_REDIRECT,
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
