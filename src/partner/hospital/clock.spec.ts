import { dateStart, dayKey, dayStart, wallClock } from './clock';

describe('provider wall clock', () => {
  const tz = 'Asia/Kolkata';

  it('reads the local day and time, not the server clock', () => {
    // 20:00 UTC on 4 Nov is 01:30 on 5 Nov in India (a Thursday).
    const w = wallClock(new Date('2026-11-04T20:00:00Z'), tz);
    expect([w.year, w.month, w.day, w.weekday, w.minutes]).toEqual([
      2026,
      11,
      5,
      'thu',
      90,
    ]);
    expect(dayKey(new Date('2026-11-04T20:00:00Z'), tz)).toBe('261105');
  });

  it('finds local midnight', () => {
    expect(dayStart(new Date('2026-11-04T20:00:00Z'), tz).toISOString()).toBe(
      '2026-11-04T18:30:00.000Z',
    );
    expect(dayStart(new Date('2026-11-04T10:00:00Z'), tz).toISOString()).toBe(
      '2026-11-03T18:30:00.000Z',
    );
    expect(dateStart('2026-11-05', tz).toISOString()).toBe(
      '2026-11-04T18:30:00.000Z',
    );
    expect(dateStart('2026-11-05', 'UTC').toISOString()).toBe(
      '2026-11-05T00:00:00.000Z',
    );
  });
});
