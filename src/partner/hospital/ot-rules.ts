import { wallClock } from './clock';

/**
 * Operation theatre rules: which cases clash, and what must be done
 * before a case moves to the next stage (pre-op readiness and the WHO
 * Surgical Safety Checklist).
 */

export interface Slot {
  id?: string;
  start: Date;
  end: Date;
}

export const overlaps = (a: Slot, b: Slot) =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

export type Stage =
  | 'scheduled'
  | 'pre_op'
  | 'in_theatre'
  | 'recovery'
  | 'completed'
  | 'cancelled'
  | 'postponed';

const NEXT: Record<Stage, Stage[]> = {
  scheduled: ['pre_op', 'cancelled', 'postponed'],
  pre_op: ['in_theatre', 'scheduled', 'cancelled', 'postponed'],
  in_theatre: ['recovery', 'completed'],
  recovery: ['completed'],
  completed: [],
  cancelled: [],
  postponed: ['scheduled'],
};

export interface CaseState {
  side: string;
  anaesthesia: string;
  preOp: Partial<Record<string, unknown>>;
  safety: { signIn?: unknown; timeOut?: unknown; signOut?: unknown };
  postOp?: { procedureDone?: string; disposition?: string } | null;
}

/** Local anaesthesia without sedation needs no anaesthetist work-up or recovery bay. */
export const isLocalOnly = (anaesthesia: string) => anaesthesia === 'local';

/**
 * What is still missing before a case may move from its current stage to
 * `to`, as readable items (empty = allowed). Throwing is left to the caller.
 */
export function missingFor(from: Stage, to: Stage, c: CaseState): string[] {
  if (!NEXT[from].includes(to))
    return [
      `A case can't go from ${from.replace('_', '-')} to ${to.replace('_', '-')}`,
    ];
  const missing: string[] = [];
  if (to === 'in_theatre') {
    if (!c.preOp.consent) missing.push('Consent signed');
    if (c.side !== 'na' && !c.preOp.siteMarked)
      missing.push('Operative site marked');
    if (!isLocalOnly(c.anaesthesia)) {
      if (!c.preOp.anaesthesiaCheck) missing.push('Pre-anaesthesia check');
      if (!c.preOp.fasting) missing.push('Fasting (NPO) confirmed');
    }
  }
  if (to === 'recovery' || (to === 'completed' && from === 'in_theatre')) {
    if (!c.safety.signIn) missing.push('WHO Sign In (before induction)');
    if (!c.safety.timeOut) missing.push('WHO Time Out (before incision)');
    if (!c.safety.signOut)
      missing.push('WHO Sign Out (before leaving theatre)');
  }
  if (
    to === 'completed' &&
    from === 'in_theatre' &&
    !isLocalOnly(c.anaesthesia)
  )
    missing.push(
      'Recovery — only local-anaesthesia cases skip the recovery bay',
    );
  if (to === 'completed') {
    if (!c.postOp?.procedureDone)
      missing.push('Operation note: procedure performed');
    if (!c.postOp?.disposition)
      missing.push('Operation note: where the patient goes next');
  }
  return missing;
}

/** Minutes between two times, or null. */
export const minutes = (a?: Date | null, b?: Date | null) =>
  a && b ? Math.round((b.getTime() - a.getTime()) / 60000) : null;

/** Roster blocks that fall on a date (provider's weekday), as minutes from local midnight. */
export function rosterFor(
  blocks: { day: string; start: string; end: string }[],
  date: Date,
  tz?: string,
): { start: number; end: number }[] {
  const day = wallClock(date, tz).weekday;
  const toMin = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  return blocks
    .filter((b) => b.day === day)
    .map((b) => ({ start: toMin(b.start), end: toMin(b.end) }))
    .sort((a, b) => a.start - b.start);
}

/** Is [start, end) inside the duty roster (provider's wall clock)? No roster at all = unknown → true. */
export function onRoster(
  blocks: { day: string; start: string; end: string }[],
  start: Date,
  end: Date,
  tz?: string,
): boolean {
  if (!blocks.length) return true;
  const day = rosterFor(blocks, start, tz);
  const s = wallClock(start, tz).minutes;
  const e = s + Math.round((end.getTime() - start.getTime()) / 60000);
  return day.some((b) => s >= b.start && e <= b.end);
}

/**
 * Checklist steps that must precede a recorded time: anaesthesia starts
 * after Sign In, the incision after Time Out, the patient leaves theatre
 * after Sign Out. Returns the missing step, or null.
 */
export function timeGate(
  field: string,
  safety: { signIn?: unknown; timeOut?: unknown; signOut?: unknown },
): string | null {
  if (field === 'anaesthesiaStart' && !safety.signIn)
    return 'WHO Sign In comes before induction';
  if (field === 'incision' && !safety.timeOut)
    return 'WHO Time Out comes before the incision';
  if (field === 'wheeledOut' && !safety.signOut)
    return 'WHO Sign Out comes before the patient leaves theatre';
  return null;
}
