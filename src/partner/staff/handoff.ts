export interface HandoffTarget {
  id: string;
  name: string;
  /** Work already on their plate. */
  load: number;
}

/** Gives each item to whoever has the least work at that moment, so nobody is swamped. */
export function spreadEvenly<T>(
  items: T[],
  targets: HandoffTarget[],
): { target: HandoffTarget; items: T[] }[] {
  if (!targets.length) return [];
  const pots = targets.map((target) => ({
    target,
    load: target.load,
    items: [] as T[],
  }));
  for (const item of items) {
    const pot = pots.reduce((a, b) => (b.load < a.load ? b : a));
    pot.items.push(item);
    pot.load += 1;
  }
  return pots
    .filter((p) => p.items.length)
    .map(({ target, items: given }) => ({ target, items: given }));
}
