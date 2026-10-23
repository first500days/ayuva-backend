import { AiService } from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';

/** The AI Control Center surface whose prompt drives each AI service. */
export const SURFACE_KEY_BY_SERVICE: Partial<Record<AiService, string>> = {
  [AiService.REPORT_INTERPRETER]: 'report_interpreter',
  [AiService.SYMPTOM_NAV]: 'symptom_triage',
  [AiService.CARE_JOURNEY]: 'symptom_triage',
  [AiService.ASSISTANT]: 'appointment_discovery',
};

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** "v2.1.4" → [2, 1, 4]; anything else → null. */
export function parseVersion(version: string): [number, number, number] | null {
  const match = VERSION_PATTERN.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * The patch after the highest version a surface has ever had, so a save
 * after a rollback never reuses the number of the version rolled back.
 */
export function nextPatchVersion(versions: string[]): string {
  let highest: [number, number, number] = [1, 0, 0];
  for (const v of versions) {
    const parsed = parseVersion(v);
    if (!parsed) continue;
    const newer =
      parsed[0] !== highest[0]
        ? parsed[0] > highest[0]
        : parsed[1] !== highest[1]
          ? parsed[1] > highest[1]
          : parsed[2] > highest[2];
    if (newer) highest = parsed;
  }
  return `v${highest[0]}.${highest[1]}.${highest[2] + 1}`;
}
