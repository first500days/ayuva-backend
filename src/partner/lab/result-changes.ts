import { isCriticalFlag } from './lab-flags';

export interface ResultRow {
  /** "Test|Parameter#n" — n counts repeats of the same pair (e.g. a package listing a test twice). */
  key: string;
  test: string;
  name: string;
  value: string;
  unit: string | null;
  flag: string;
}

interface TestLike {
  name: string;
  values: {
    name: string;
    value?: string | null;
    unit?: string | null;
    flag?: string;
  }[];
}

/** Flattens report sections into one row per reported value. */
export function resultRows(tests: TestLike[]): ResultRow[] {
  const seen = new Map<string, number>();
  return tests.flatMap((t) =>
    t.values.map((v) => {
      const pair = `${t.name}|${v.name}`;
      const n = seen.get(pair) ?? 0;
      seen.set(pair, n + 1);
      return {
        key: `${pair}#${n}`,
        test: t.name,
        name: v.name,
        value: (v.value ?? '').trim(),
        unit: v.unit || null,
        flag: v.flag ?? 'none',
      };
    }),
  );
}

/**
 * What a save did to the report: values typed in for the first time, and
 * values that already had a result and were changed (manual overrides,
 * including clearing one).
 */
export function resultChanges(before: ResultRow[], after: ResultRow[]) {
  const previous = new Map(before.map((r) => [r.key, r.value]));
  const entered: ResultRow[] = [];
  const overridden: { row: ResultRow; from: string }[] = [];
  for (const row of after) {
    const from = previous.get(row.key) ?? '';
    if (from === row.value) continue;
    if (from) overridden.push({ row, from });
    else entered.push(row);
  }
  return { entered, overridden };
}

/** Critical values the lab hasn't been alerted about yet. */
export function freshCritical(after: ResultRow[], alerted: string[]) {
  const done = new Set(alerted);
  return after.filter((r) => isCriticalFlag(r.flag) && !done.has(r.key));
}
