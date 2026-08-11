# AYUVA — AI Integration Contract & Handoff

| | |
|---|---|
| **Status** | Ready — MOCK implementation live, contract stable |
| **Audience** | The AI/LLM-owning team/vendor building the real Symptom Navigation, Care Journey Generation, Report Interpretation, and Conversational Assistant logic |
| **Companion documents** | [PRD.md](../../docs/PRD.md) §3, §6, §7.1, §7.6 · [TRD.md](../../docs/TRD.md) §6 |

---

## 1. What this document is

This platform's non-AI build (auth, core domain, admin portal, mobile/web clients) is being delivered by a separate team from the one building the actual AI/LLM reasoning. To keep both teams unblocked, this team has:

1. Defined the exact request/response contract every AI capability must satisfy.
2. Built a **mock implementation** of that contract — deterministic/keyword-based placeholder logic, **not** a real model — so every downstream screen (mobile app, admin AI Monitoring) can be built and demoed today.
3. Wired that mock into the real database, the real auth/RBAC layer, and the real `AIInteractionLog` audit trail, so swapping in the real implementation later is a drop-in, not a renegotiation.

**Your job**: implement the real reasoning behind each endpoint below, matching the same route, same request/response shape, and same guardrails. When you're ready to cut over, swap the mock logic inside each service for a call to your model, set `source: "real"` in the response and in the logged interaction, and nothing else in this codebase, the admin portal, or the mobile app needs to change.

## 2. Hard guardrails (apply to every capability, no exceptions)

These come from [PRD.md §3](../../docs/PRD.md#3-product-positioning--legal-boundary-hard-constraint) and are a legal/product requirement, not a suggestion:

- **Never diagnose a condition.** No endpoint may name a disease or condition.
- **Never predict disease likelihood.**
- **Never recommend or suggest a treatment or medicine.**
- **Always direct the patient toward a qualified professional** for actual medical judgment.
- **The mandatory disclaimer must appear on every response** that surfaces AI output (see §3 below) — this is enforced structurally in every response DTO in this codebase; do not build a response path that can omit it.
- **Every response must carry a `source` field** (`"mock"` | `"real"`) so downstream consumers (mobile app, admin AI Monitoring) can always tell mock output from real output. Never emit a response that omits this field or is ambiguous about which one it is.
- **Every call must be logged** to `AIInteractionLog` before the response returns (see §7).

## 3. Mandatory disclaimer text (verbatim)

```
AYUVA provides healthcare navigation, document organization, and information simplification only. AYUVA does not provide medical advice, diagnosis, treatment recommendations, or emergency guidance. Always consult a qualified healthcare professional.
```

Defined once in code at `src/ai/common/ai-disclaimer.constant.ts` (`AI_DISCLAIMER`) — import it, don't retype it.

## 4. Authentication

Every endpoint below requires a valid patient JWT (`Authorization: Bearer <token>`), enforced via `JwtAuthGuard`. The authenticated user's id (`user.sub` from the JWT payload) is the owner of any created records — never accept a `userId` in the request body.

## 5. Endpoint-by-endpoint contract

All routes are under the global API prefix `/api/v1`.

### 5.1 Symptom Navigation

**`POST /api/v1/symptom-nav/analyse`**

Request body (`CreateSymptomEntryDto`):
```json
{
  "rawText": "Sharp chest tightness that comes and goes, worse on stairs.",
  "durationDays": 3
}
```

Response (`SymptomNavResponseDto`, 201):
```json
{
  "symptomEntryId": "64f0c8e2b1a2c3d4e5f6a7b8",
  "triageResultId": "64f0c8e2b1a2c3d4e5f6a7b9",
  "extractedSymptoms": ["Sharp chest tightness", "Comes and goes"],
  "understoodSymptoms": ["Sharp chest tightness", "Comes and goes"],
  "urgency": "priority",
  "riskLevel": "moderate_high",
  "recommendedCareLevel": "specialist",
  "rulesVersion": "mock-rules-v1",
  "source": "mock",
  "disclaimer": "AYUVA provides healthcare navigation, document organization, and information simplification only. AYUVA does not provide medical advice, diagnosis, treatment recommendations, or emergency guidance. Always consult a qualified healthcare professional."
}
```

Enums (must be used exactly as-is — defined in `src/ai/symptom-nav/schemas/triage-result.schema.ts`):
- `urgency`: `routine` | `priority` | `emergency`
- `riskLevel`: `low` | `moderate_high` | `high`
- `recommendedCareLevel`: `self_care` | `gp` | `specialist` | `urgent_care` | `emergency_room` — **exactly one value, never a diagnosis or named condition.**

`GET /api/v1/symptom-nav/:triageResultId` retrieves a previously generated result (ownership-checked against the caller's JWT).

Persistence: creates one `SymptomEntry` (raw input + extracted symptoms) and one `TriageResult` (urgency/risk/care-tier), linked by `symptomEntryId`. `rulesVersion` must be bumped whenever your classification logic changes materially — this is how a clinical/legal reviewer traces which version of the logic produced a given result (a release gate per [PRD.md §11](../../docs/PRD.md#11-success-metrics)).

Optional input the mock already reads for context: the caller's `HealthProfile` (age, gender, conditions, allergies) via `userId` — use it as context, never as the sole basis for an output value.

### 5.2 Care Journey Generation

**`POST /api/v1/care-journey/generate`**

Request body (`GenerateCareJourneyDto`):
```json
{ "triageResultId": "64f0c8e2b1a2c3d4e5f6a7b9" }
```
The `TriageResult` must belong (transitively, via its `SymptomEntry`) to the authenticated user, or the endpoint 404s.

Response (`CareJourneyResponseDto`, 201):
```json
{
  "id": "64f0c8e2b1a2c3d4e5f6a7ba",
  "triageResultId": "64f0c8e2b1a2c3d4e5f6a7b9",
  "title": "Care Journey — Specialist Consultation",
  "steps": [
    { "name": "GP Referral", "status": "current", "contextNote": "Obtain a referral letter and any prior test results." },
    { "name": "Specialist Consultation", "status": "upcoming", "contextNote": "Prepare a list of questions for the specialist." }
  ],
  "progressPct": 0,
  "status": "active",
  "timelineEstimateDays": 14,
  "source": "mock",
  "disclaimer": "..."
}
```

Enums: `steps[].status`: `done` | `current` | `upcoming`. `status` (journey-level): `active` | `resolved` | `cancelled`.

Output must be **structured steps, not free text** — no paragraph-form "here's your journey" narrative. `timelineEstimateDays` is a rough estimate, not a clinical claim about outcomes.

Also live (not part of your scope — real, non-AI persisted state, listed here so you know they exist and won't need touching):
- `GET /api/v1/care-journey/active` — caller's current active journey.
- `GET /api/v1/care-journey/:id` — retrieve by id.
- `PATCH /api/v1/care-journey/:id/steps` — patient marks a step done/current; this recomputes `progressPct` server-side. This is genuine user-driven state, not AI output — don't route it through your model.

### 5.3 Report Interpretation

**`POST /api/v1/report-interpreter/analyse`**

Request body (`AnalyseReportDto`):
```json
{ "recordId": "64f0c8e2b1a2c3d4e5f6a7b8" }
```
`recordId` references an uploaded `MedicalRecord` owned by the caller (image/PDF/text already stored in object storage — see `src/storage/storage.service.ts` for how to read the file bytes via `fileRef`).

Response (`ReportInterpretationResponseDto`, 201):
```json
{
  "id": "64f0c8e2b1a2c3d4e5f6a7bb",
  "recordId": "64f0c8e2b1a2c3d4e5f6a7b8",
  "summaryText": "This blood panel checks how key body systems are functioning...",
  "highlightedValues": [
    { "label": "Hemoglobin", "value": "11.2 g/dL", "status": "low" }
  ],
  "suggestedQuestions": ["What does this flagged value mean for my day-to-day health?"],
  "aiStatus": "interpreted",
  "source": "mock",
  "disclaimer": "..."
}
```

Enums: `highlightedValues[].status`: `normal` | `high` | `low` — **rules-based against reference ranges, never LLM judgement of what a value "means" clinically** ([TRD.md §6](../../docs/TRD.md#6-ai-layer-specification)). `aiStatus`: `queued` | `processing` | `interpreted`.

The endpoint is **idempotent per record**: if an interpretation already exists and `aiStatus === "interpreted"`, return the existing one rather than regenerating (still log the call). `GET /api/v1/report-interpreter/:recordId` retrieves an existing interpretation without regenerating.

**Must not** recommend treatment or medication changes, and must not diagnose from the report — glossary/summarization/plain-English conversion only, with abnormalities *highlighted*, not *explained clinically*.

### 5.4 Conversational Assistant

**`POST /api/v1/assistant/chat`**

Request body (`ChatRequestDto`):
```json
{ "message": "How do I book an appointment with a specialist?" }
```

Response (`ChatResponseDto`, 201):
```json
{
  "reply": "You can book a specialist from the Providers tab — search by specialty, then pick an open slot.",
  "scope": "organizational",
  "source": "mock",
  "disclaimer": "..."
}
```

Enum `scope`: `organizational` | `clinical_redirect`. Any message that reads as a request for a diagnosis, a named condition, or a medicine/dosage recommendation **must** return `scope: "clinical_redirect"` with a reply that declines to answer clinically and points the user at a professional (and, where relevant, offers to start Symptom Navigation or provider search instead) — never answer the clinical question, even partially, even hedged.

## 6. What "swap the mock for real" means concretely

Each capability's business logic lives in exactly one service file:

| Capability | Service to replace | Route stays the same |
|---|---|---|
| Symptom Navigation | `src/ai/symptom-nav/symptom-nav.service.ts` | `POST /symptom-nav/analyse` |
| Care Journey Generation | `src/ai/care-journey/care-journey.service.ts` (`generate()` only — leave `findOne`/`findActive`/`updateStep` alone) | `POST /care-journey/generate` |
| Report Interpretation | `src/ai/report-interpreter/report-interpreter.service.ts` | `POST /report-interpreter/analyse` |
| Conversational Assistant | `src/ai/assistant/assistant.service.ts` | `POST /assistant/chat` |

To cut over:
1. Replace the mock generation logic inside the service method with a call to your model/pipeline.
2. Keep the same DTO shapes in and out — the mobile app and admin portal are built against these exact shapes and will not be changed to accommodate a different one.
3. Change `source: AiSource.MOCK` to `source: AiSource.REAL` in both the response and the `AiInteractionLogService.record(...)` call.
4. Keep calling `AiInteractionLogService.record(...)` synchronously before the response returns — this is what feeds Admin AI Monitoring and any future regulatory audit ([TRD.md §6](../../docs/TRD.md#6-ai-layer-specification)).
5. Keep attaching `AI_DISCLAIMER` to every response.
6. If your model can produce a diagnosis-adjacent or emergency-sounding output, route it through the same guardrail checks the mock uses today (keyword/rule gate before the recommended care tier is finalized) — don't let raw model output reach the client unchecked.

No controller, module, DTO, or downstream client code needs to change for a correctly-shaped swap.

## 7. Logging contract (`AIInteractionLog`)

Every call to any of the four endpoints writes one document via `AiInteractionLogService.record(...)` (`src/ai/ai-interaction-log/ai-interaction-log.service.ts`) **before** the HTTP response returns:

| Field | Meaning |
|---|---|
| `userId` | Caller's user id |
| `service` | One of `symptomNav` \| `careJourney` \| `reportInterpreter` \| `assistant` (`AiService` enum) |
| `input` | Structured summary of the request (not necessarily the full raw payload) |
| `outcome` | Structured summary of the response |
| `latencyMs` | Wall-clock time for the call |
| `source` | `"mock"` \| `"real"` |
| `flagged` | `true` when the interaction needs human review — mock sets this for non-`LOW` risk/status; keep equivalent logic for real output |

This table already feeds `GET /api/v1/admin/ai/overview`, `/logs`, and `/escalations` (`src/admin/ai/`) — no changes needed there when you cut over; it will simply start reflecting `source: "real"` data as soon as you write it.

## 8. What you do NOT need to build

- Auth, RBAC, consent, or audit logging — already handled by the platform team.
- The admin AI Monitoring UI — already reads off `AIInteractionLog`.
- Object storage / file retrieval for report interpretation — already handled by `StorageService`; you receive/fetch bytes, you don't build the storage layer.
- Rate limiting or API gateway concerns — out of scope for this contract; raise with the platform team if your model calls need it.

## 9. Open items that affect you

Per [CLIENT_QUESTIONS.md](../../docs/CLIENT_QUESTIONS.md), these are still open and will shape your build — check before finalizing prompts/model choice:
- **§D3**: AI provider (OpenAI vs. alternative), budget, and whether a signed Data Processing Agreement is required before real patient data is sent to a third-party model.
- **§B1**: Exact wording/edge-case handling for the navigation-vs-diagnosis line — needs clinical/legal sign-off before real (non-demo) patient data is processed.
- **§B3**: Regulatory regime (UK GDPR / US HIPAA / other) governing data handling at launch.

Until those are resolved, build and test against synthetic/demo data only, consistent with [PRD.md §12](../../docs/PRD.md#12-assumptions--dependencies).
