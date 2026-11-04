/**
 * Wall-clock helpers in the providers' time zone (SLOT_TIMEZONE, default
 * Asia/Kolkata — the same setting appointment slots use), so day numbers,
 * duty rosters and "today" don't follow the server's UTC clock.
 */

const zone = (): string => process.env.SLOT_TIMEZONE ?? 'Asia/Kolkata';
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export interface WallClock {
  year: number;
  month: number; // 1–12
  day: number;
  weekday: (typeof WEEKDAYS)[number];
  /** Minutes since local midnight. */
  minutes: number;
}

export function wallClock(d: Date, tz = zone()): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: get('weekday').slice(0, 3).toLowerCase() as WallClock['weekday'],
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** The instant of local midnight starting the day that contains `d`. */
export function dayStart(d: Date, tz = zone()): Date {
  const w = wallClock(d, tz);
  const localAsUtc = Date.UTC(
    w.year,
    w.month - 1,
    w.day,
    Math.floor(w.minutes / 60),
    w.minutes % 60,
  );
  const offset = localAsUtc - Math.floor(d.getTime() / 60000) * 60000;
  return new Date(Date.UTC(w.year, w.month - 1, w.day) - offset);
}

/** Local midnight of a calendar date given as YYYY-MM-DD. */
export function dateStart(ymd: string, tz = zone()): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  // Noon UTC is the same calendar day everywhere from UTC−12 to UTC+11.
  return dayStart(new Date(Date.UTC(y, m - 1, d, 12)), tz);
}

/** "261104" for 4 Nov 2026 in the providers' zone — for case / visit numbers. */
export function dayKey(d: Date, tz = zone()): string {
  const w = wallClock(d, tz);
  return `${String(w.year).slice(2)}${String(w.month).padStart(2, '0')}${String(w.day).padStart(2, '0')}`;
}
