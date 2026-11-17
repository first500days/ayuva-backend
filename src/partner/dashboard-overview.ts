import { AppointmentStatus } from '../core/appointments/schemas/appointment.schema';
import { wallClock } from './hospital/clock';

/** Periods the dashboard's overview chart can show. */
export const OVERVIEW_RANGES = [
  'week',
  'month',
  'last_month',
  'last_90_days',
] as const;
export type OverviewRange = (typeof OVERVIEW_RANGES)[number];

export type OverviewMetric = 'appointments' | 'admissions' | 'revenue';

export type OverviewDay = { date: string } & Partial<
  Record<OverviewMetric, number | null>
>;

/** Appointments that took (or will take) a slot — the same set Analytics counts. */
export const BOOKED_STATUSES = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.REQUESTED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];

const DAY = 86_400_000;
const WEEKDAY_INDEX = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
} as const;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** The calendar date of an instant in the providers' zone, as YYYY-MM-DD. */
export function localDate(d: Date, tz?: string): string {
  const w = wallClock(d, tz);
  return `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** The calendar date after a YYYY-MM-DD date. */
export function nextDay(ymd: string): string {
  return isoDay(new Date(`${ymd}T00:00:00.000Z`).getTime() + DAY);
}

/**
 * The calendar days a range covers, in the providers' zone. "This week" (Monday
 * first) and "this month" run to their last day so bookings ahead show; the
 * other two end on or before today.
 */
export function overviewDays(
  range: OverviewRange,
  now: Date,
  tz?: string,
): { days: string[]; today: string } {
  const w = wallClock(now, tz);
  const today = Date.UTC(w.year, w.month - 1, w.day);
  let from: number;
  let to: number;
  switch (range) {
    case 'week':
      from = today - WEEKDAY_INDEX[w.weekday] * DAY;
      to = from + 6 * DAY;
      break;
    case 'last_month':
      from = Date.UTC(w.year, w.month - 2, 1);
      to = Date.UTC(w.year, w.month - 1, 1) - DAY;
      break;
    case 'last_90_days':
      from = today - 89 * DAY;
      to = today;
      break;
    default:
      from = Date.UTC(w.year, w.month - 1, 1);
      to = Date.UTC(w.year, w.month, 1) - DAY;
  }
  const days: string[] = [];
  for (let t = from; t <= to; t += DAY) days.push(isoDay(t));
  return { days, today: isoDay(today) };
}

/**
 * Day-by-day figures for the chart, for the metrics the member may see.
 * Appointments count on every day, bookings ahead included. Admissions and
 * revenue can't be known ahead, so days after today are null: the line ends
 * at today instead of dropping to zero.
 */
export function bucketOverview(input: {
  days: string[];
  today: string;
  metrics: OverviewMetric[];
  /** Calendar day of each booked appointment's slot. */
  appointmentDates: string[];
  /** Local day of each admission. */
  admissionDates: string[];
  /** Local day and amount of each successful payment. */
  payments: { date: string; amount: number }[];
}): { days: OverviewDay[]; totals: Partial<Record<OverviewMetric, number>> } {
  const tally = (entries: [string, number][]) => {
    const sums = new Map<string, number>();
    for (const [day, n] of entries) sums.set(day, (sums.get(day) ?? 0) + n);
    return sums;
  };
  const perDay: Record<OverviewMetric, Map<string, number>> = {
    appointments: tally(input.appointmentDates.map((d) => [d, 1])),
    admissions: tally(input.admissionDates.map((d) => [d, 1])),
    revenue: tally(input.payments.map((p) => [p.date, p.amount])),
  };

  const totals: Partial<Record<OverviewMetric, number>> = {};
  const days = input.days.map((date) => {
    const row: OverviewDay = { date };
    for (const metric of input.metrics) {
      const ahead = date > input.today && metric !== 'appointments';
      const value = ahead ? null : round2(perDay[metric].get(date) ?? 0);
      row[metric] = value;
      totals[metric] = round2((totals[metric] ?? 0) + (value ?? 0));
    }
    return row;
  });
  return { days, totals };
}
