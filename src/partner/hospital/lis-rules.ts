/** Hospital LIS rules: allowed status moves and turnaround targets. */

export type LisStage =
  | 'requested'
  | 'collected'
  | 'received'
  | 'processing'
  | 'resulted'
  | 'verified'
  | 'rejected'
  | 'cancelled';

const MOVES: Record<LisStage, LisStage[]> = {
  // A sample drawn at the lab counter can be received straight away.
  requested: ['collected', 'received', 'cancelled'],
  collected: ['received', 'rejected', 'cancelled'],
  received: ['processing', 'resulted', 'rejected'],
  processing: ['resulted', 'rejected'],
  resulted: ['verified'],
  verified: [],
  rejected: [],
  cancelled: [],
};

export function canMove(from: LisStage, to: LisStage): boolean {
  return MOVES[from].includes(to);
}

/** Turnaround target from reception to verified report, by priority (minutes). */
export const TAT_TARGET: Record<string, number> = {
  stat: 60,
  urgent: 4 * 60,
  routine: 24 * 60,
};

/** Minutes past the target for a sample in the lab and not yet verified (≤ 0 = within target). */
export function overTarget(
  priority: string,
  receivedAt: Date | undefined,
  now: Date,
): number | null {
  if (!receivedAt) return null;
  const target = TAT_TARGET[priority] ?? TAT_TARGET.routine;
  return Math.floor((now.getTime() - receivedAt.getTime()) / 60000 - target);
}

/** Which result entries a sample in a given status accepts. */
export function allowedKinds(status: LisStage): string[] {
  if (status === 'received' || status === 'processing')
    return ['preliminary', 'final', 'note'];
  if (status === 'resulted') return ['preliminary', 'final', 'note'];
  if (status === 'verified') return ['addendum', 'note'];
  return [];
}
