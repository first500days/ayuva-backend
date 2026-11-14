/**
 * Time-sensitive escalation for the Super-Admin panel: an operational
 * exception still untouched (open, triaged or reopened, nobody on it) or a
 * provider still waiting for verification 15 minutes after it arrived turns
 * into an alert, so it is picked up quickly.
 */

export const ESCALATE_AFTER_MS = 15 * 60_000;

export function waitingMinutes(
  since: Date | undefined | null,
  now: Date,
): number {
  if (!since) return 0;
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
}

export function isEscalated(
  since: Date | undefined | null,
  now: Date,
): boolean {
  return !!since && now.getTime() - since.getTime() >= ESCALATE_AFTER_MS;
}

/** Issue states nobody has picked up yet. */
export const UNADDRESSED_ISSUE_STATES = ['open', 'triaged', 'reopened'];
