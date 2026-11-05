/**
 * Westgard multi-rule QC evaluation for one control material (one analyte,
 * one level), applied to each new run against the material's target mean
 * and SD and its recent accepted runs.
 *
 *   1-2s  one result beyond ±2 SD                       → warning
 *   1-3s  one result beyond ±3 SD                       → reject
 *   2-2s  two consecutive beyond 2 SD on the same side  → reject
 *   R-4s  consecutive results differ by more than 4 SD  → reject
 *   4-1s  four consecutive beyond 1 SD on the same side → reject
 *   10x   ten consecutive on the same side of the mean  → reject
 */

export type QcStatus = 'accept' | 'warning' | 'reject';

export interface QcEvaluation {
  z: number;
  rules: string[];
  status: QcStatus;
}

export const RULE_TEXT: Record<string, string> = {
  '1-2s': 'beyond ±2 SD (warning)',
  '1-3s': 'beyond ±3 SD',
  '2-2s': 'two in a row beyond 2 SD on the same side',
  'R-4s': 'range between consecutive runs over 4 SD',
  '4-1s': 'four in a row beyond 1 SD on the same side',
  '10x': 'ten in a row on the same side of the mean',
};

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * @param value   the new control result
 * @param history earlier results for this material (oldest first), excluding rejected or excluded runs
 */
export function evaluateRun(
  value: number,
  mean: number,
  sd: number,
  history: number[],
): QcEvaluation {
  const zOf = (v: number) => (v - mean) / sd;
  const z = zOf(value);
  const zs = [...history.map(zOf), z];
  const last = (n: number) => zs.slice(-n);
  const rules: string[] = [];

  if (Math.abs(z) > 3) rules.push('1-3s');
  const two = last(2);
  if (two.length === 2 && two.every((x) => x > 2)) rules.push('2-2s');
  if (two.length === 2 && two.every((x) => x < -2)) rules.push('2-2s');
  if (two.length === 2 && Math.abs(two[0] - two[1]) > 4) rules.push('R-4s');
  const four = last(4);
  if (
    four.length === 4 &&
    (four.every((x) => x > 1) || four.every((x) => x < -1))
  )
    rules.push('4-1s');
  const ten = last(10);
  if (ten.length === 10 && (ten.every((x) => x > 0) || ten.every((x) => x < 0)))
    rules.push('10x');

  const reject = rules.length > 0;
  if (!reject && Math.abs(z) > 2) rules.push('1-2s');
  return {
    z: round(z),
    rules,
    status: reject ? 'reject' : rules.length ? 'warning' : 'accept',
  };
}

/** Observed mean, SD and CV% of a set of control results. */
export function qcStats(values: number[]) {
  const n = values.length;
  if (!n) return { n: 0, mean: null, sd: null, cv: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd =
    n > 1
      ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1))
      : null;
  return {
    n,
    mean: round(mean),
    sd: sd === null ? null : round(sd),
    cv: sd === null || mean === 0 ? null : round((sd / Math.abs(mean)) * 100),
  };
}
