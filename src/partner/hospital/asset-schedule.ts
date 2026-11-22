/** Preventive-maintenance / calibration schedule rules for hospital equipment. */

const DAY = 24 * 60 * 60 * 1000;
/** A service falling due within this many days is shown as "due soon". */
export const DUE_SOON_DAYS = 14;

export type DueState = 'overdue' | 'due' | 'ok' | 'none';

export function nextDue(
  last: Date | null | undefined,
  intervalDays: number | null | undefined,
): Date | undefined {
  if (!last || !intervalDays) return undefined;
  return new Date(last.getTime() + intervalDays * DAY);
}

export function dueState(
  next: Date | null | undefined,
  today: Date,
  soonDays = DUE_SOON_DAYS,
): DueState {
  if (!next) return 'none';
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  if (next.getTime() < start.getTime()) return 'overdue';
  if (next.getTime() < start.getTime() + soonDays * DAY) return 'due';
  return 'ok';
}
