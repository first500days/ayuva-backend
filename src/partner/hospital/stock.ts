/**
 * Pure stock rules shared by the Pharmacy and Central Supply stores: which
 * batch to issue from (first-expiry-first-out), and expiry states.
 */

export interface BatchLike {
  id: string;
  batchNo: string;
  expiryDate?: Date | null;
  quantity: number;
  receivedAt: Date;
}

export interface BatchPick {
  batchId: string;
  batchNo: string;
  expiryDate: Date | null;
  quantity: number;
}

const DAY = 24 * 60 * 60 * 1000;
/** Batches expiring within this many days are flagged "expiring soon". */
export const EXPIRY_WARNING_DAYS = 90;

function startOfDay(d: Date): number {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s.getTime();
}

/** A batch can be issued while it has stock and hasn't passed its expiry date. */
export function isUsable(b: BatchLike, today: Date): boolean {
  if (b.quantity <= 0) return false;
  return !b.expiryDate || b.expiryDate.getTime() >= startOfDay(today);
}

export type ExpiryState = 'expired' | 'expiring' | 'ok' | 'none';

export function expiryState(
  expiryDate: Date | null | undefined,
  today: Date,
  warnDays = EXPIRY_WARNING_DAYS,
): ExpiryState {
  if (!expiryDate) return 'none';
  const t = expiryDate.getTime();
  if (t < startOfDay(today)) return 'expired';
  if (t < startOfDay(today) + warnDays * DAY) return 'expiring';
  return 'ok';
}

/**
 * Plans an issue of `quantity` units: the batch that expires first goes
 * first (undated batches last, then oldest received). Expired and empty
 * batches are never picked. `preferBatchId` (a batch the user chose) is
 * drawn from before the rest. `short` is what the usable stock can't cover.
 */
export function planIssue(
  batches: BatchLike[],
  quantity: number,
  today: Date,
  preferBatchId?: string,
): { picks: BatchPick[]; short: number } {
  const usable = batches.filter((b) => isUsable(b, today));
  usable.sort((a, b) => {
    if (preferBatchId) {
      if (a.id === preferBatchId) return -1;
      if (b.id === preferBatchId) return 1;
    }
    const ae = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const be = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ae !== be) return ae - be;
    return a.receivedAt.getTime() - b.receivedAt.getTime();
  });
  const picks: BatchPick[] = [];
  let left = quantity;
  for (const b of usable) {
    if (left <= 0) break;
    const take = Math.min(left, b.quantity);
    picks.push({
      batchId: b.id,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate ?? null,
      quantity: take,
    });
    left -= take;
  }
  return { picks, short: Math.max(0, left) };
}

/** Stock that can actually be issued today (excludes expired batches). */
export function usableQuantity(batches: BatchLike[], today: Date): number {
  return batches
    .filter((b) => isUsable(b, today))
    .reduce((n, b) => n + b.quantity, 0);
}
