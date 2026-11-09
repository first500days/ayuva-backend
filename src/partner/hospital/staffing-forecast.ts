/**
 * Suggests extra shifts from past demand. For each weekday and hour it takes
 * a weighted average of recent weeks, compares what that needs with who is on
 * the roster, and joins neighbouring short hours into a shift. A plain
 * forecast rather than a trained model, and it only suggests: rosters stay a
 * person's decision.
 */

export const FORECAST_WEEKS = 8;
/** Each week back counts for this fraction of the one after it. */
const WEEK_DECAY = 0.85;
export const VISITS_PER_CLINICIAN_HOUR = 4;
/** Below this many expected visits an hour isn't worth a shift. */
const MIN_EXPECTED = 1;

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface PastVisit {
  /** 0 is Monday. */
  weekday: number;
  hour: number;
  /** Whole weeks before now: 0 is the past seven days. */
  weeksAgo: number;
}

export interface DutyBlock {
  day: string;
  start: string;
  end: string;
}

export interface ShiftSuggestion {
  weekday: number;
  day: string;
  start: string;
  end: string;
  /** Busiest hour in the shift, as visits per hour. */
  expectedPeak: number;
  /** Fewest clinicians rostered at any point in it. */
  rostered: number;
  /** How many more clinicians the busiest hour needs. */
  extra: number;
}

const emptyMatrix = () =>
  Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

/** Expected visits per weekday and hour; weeks with no visits count as zero. */
export function expectedDemand(
  visits: PastVisit[],
  weeks = FORECAST_WEEKS,
): number[][] {
  const weights = Array.from({ length: weeks }, (_, i) => WEEK_DECAY ** i);
  const total = weights.reduce((a, b) => a + b, 0);
  const out = emptyMatrix();
  for (const v of visits) {
    if (v.weeksAgo < 0 || v.weeksAgo >= weeks) continue;
    out[v.weekday][v.hour] += weights[v.weeksAgo];
  }
  return out.map((row) => row.map((sum) => sum / total));
}

const hourOf = (time: string) => Number.parseInt(time.slice(0, 2), 10);

/** How many clinicians the roster has on, per weekday and hour. */
export function rosteredCount(staff: { dutySchedule: DutyBlock[] }[]) {
  const out = emptyMatrix();
  for (const s of staff) {
    for (const block of s.dutySchedule) {
      const day = DAY_CODES.indexOf(block.day);
      if (day < 0) continue;
      const from = hourOf(block.start);
      const minutes = block.end.slice(3);
      const to = hourOf(block.end) + (minutes !== '00' ? 1 : 0);
      for (let h = from; h < to && h < 24; h++) out[day][h] += 1;
    }
  }
  return out;
}

const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const oneDecimal = (v: number) => Math.round(v * 10) / 10;

export function suggestShifts(
  expected: number[][],
  rostered: number[][],
  perHour = VISITS_PER_CLINICIAN_HOUR,
): ShiftSuggestion[] {
  const out: ShiftSuggestion[] = [];
  expected.forEach((hours, weekday) => {
    let run: number[] = [];
    const close = () => {
      if (!run.length) return;
      const peak = Math.max(...run.map((h) => hours[h]));
      out.push({
        weekday,
        day: WEEKDAY_NAMES[weekday],
        start: clock(run[0]),
        end: clock(run[run.length - 1] + 1),
        expectedPeak: oneDecimal(peak),
        rostered: Math.min(...run.map((h) => rostered[weekday][h])),
        extra: Math.max(
          ...run.map(
            (h) => Math.ceil(hours[h] / perHour) - rostered[weekday][h],
          ),
        ),
      });
      run = [];
    };
    hours.forEach((value, hour) => {
      const short =
        value >= MIN_EXPECTED &&
        Math.ceil(value / perHour) > rostered[weekday][hour];
      if (short) run.push(hour);
      else close();
    });
    close();
  });
  return out.sort((a, b) => b.extra - a.extra || a.weekday - b.weekday);
}
