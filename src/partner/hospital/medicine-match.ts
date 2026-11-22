/**
 * Matches a prescribed medicine (free text, as the doctor wrote it) to a
 * pharmacy stock item. Deterministic word + strength matching: it only
 * suggests, the pharmacist always chooses what to supply.
 */

const FORM_WORDS = new Set([
  'tab',
  'tabs',
  'tablet',
  'tablets',
  'cap',
  'caps',
  'capsule',
  'capsules',
  'syp',
  'syrup',
  'susp',
  'suspension',
  'inj',
  'injection',
  'oint',
  'ointment',
  'cream',
  'gel',
  'drop',
  'drops',
  'lotion',
  'sachet',
  'inhaler',
  'mg',
  'mcg',
  'ml',
  'iu',
  'gm',
]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !FORM_WORDS.has(w) && !/^\d/.test(w));
}

/** Strength numbers in milligrams where the unit is known: "1 g" and "1000 mg" agree. */
export function strengthKey(s: string | null | undefined): string | null {
  if (!s) return null;
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|gm|ml|iu|%)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    const unit = (m[2] ?? '').toLowerCase();
    if (unit === 'g' || unit === 'gm') out.push(n * 1000);
    else if (unit === 'mcg' || unit === 'µg' || unit === 'ug')
      out.push(n / 1000);
    else out.push(n);
  }
  return out.length ? out.sort((a, b) => a - b).join('/') : null;
}

function wordHit(w: string, pool: string[]): boolean {
  return pool.some(
    (p) =>
      p === w ||
      (w.length >= 4 && p.length >= 4 && (p.startsWith(w) || w.startsWith(p))),
  );
}

/**
 * 0 = unrelated, 1 = similar (a substitute — different strength or only
 * some words agree), 2 = same medicine, 3 = same medicine and strength.
 */
export function matchScore(
  prescribed: string,
  prescribedStrength: string | null | undefined,
  item: { name: string; genericName?: string | null; strength?: string | null },
): number {
  const want = words(prescribed);
  if (!want.length) return 0;
  const pool = words(`${item.name} ${item.genericName ?? ''}`);
  const hits = want.filter((w) => wordHit(w, pool)).length;
  if (!hits) return 0;
  let score = hits === want.length ? 2 : 1;
  const a = strengthKey(prescribedStrength) ?? strengthKey(prescribed);
  const b = strengthKey(item.strength) ?? strengthKey(item.name);
  if (a && b) score = a === b ? score + 1 : Math.min(score, 1);
  return score;
}
