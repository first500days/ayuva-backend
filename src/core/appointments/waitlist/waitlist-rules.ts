/**
 * Who hears about a slot that just opened: people waiting for that provider
 * whose date window covers it, earliest to join first, a handful at a time
 * (the first to book gets it), and nobody nudged twice within the hour.
 */

export const NOTIFY_AT_ONCE = 5;
export const RENOTIFY_AFTER_MS = 60 * 60_000;

export interface WaitEntry {
  id: string;
  userId: string;
  /** Day window, inclusive (YYYY-MM-DD); open-ended when absent. */
  from?: string | null;
  to?: string | null;
  createdAt: Date;
  lastNotifiedAt?: Date | null;
}

export function pickWaiters(
  entries: WaitEntry[],
  slot: { day: string; at: Date },
  now: Date,
  busyUserIds: Set<string> = new Set(),
): WaitEntry[] {
  if (slot.at <= now) return [];
  return entries
    .filter((e) => !e.from || slot.day >= e.from)
    .filter((e) => !e.to || slot.day <= e.to)
    .filter(
      (e) =>
        !e.lastNotifiedAt ||
        now.getTime() - e.lastNotifiedAt.getTime() >= RENOTIFY_AFTER_MS,
    )
    .filter((e) => !busyUserIds.has(e.userId))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, NOTIFY_AT_ONCE);
}
