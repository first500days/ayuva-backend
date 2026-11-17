import {
  bucketOverview,
  localDate,
  nextDay,
  overviewDays,
} from './dashboard-overview';

describe('dashboard overview', () => {
  const tz = 'Asia/Kolkata';
  // Tuesday 17 Nov 2026, 15:30 in India.
  const now = new Date('2026-11-17T10:00:00Z');

  describe('overviewDays', () => {
    it('covers the whole month, bookings ahead included', () => {
      const { days, today } = overviewDays('month', now, tz);
      expect(days).toHaveLength(30);
      expect(days[0]).toBe('2026-11-01');
      expect(days[29]).toBe('2026-11-30');
      expect(today).toBe('2026-11-17');
    });

    it('runs Monday to Sunday for the week', () => {
      expect(overviewDays('week', now, tz).days).toEqual([
        '2026-11-16',
        '2026-11-17',
        '2026-11-18',
        '2026-11-19',
        '2026-11-20',
        '2026-11-21',
        '2026-11-22',
      ]);
      // On a Sunday the week still started the Monday before.
      const sunday = overviewDays('week', new Date('2026-11-22T06:00:00Z'), tz);
      expect(sunday.days[0]).toBe('2026-11-16');
      expect(sunday.days[6]).toBe('2026-11-22');
    });

    it("follows the providers' day, not the server's UTC day", () => {
      // 20:00 UTC on 30 Nov is already 1 Dec in India.
      const { days, today } = overviewDays(
        'month',
        new Date('2026-11-30T20:00:00Z'),
        tz,
      );
      expect(today).toBe('2026-12-01');
      expect(days).toHaveLength(31);
      expect(days[0]).toBe('2026-12-01');
    });

    it('steps back across the new year and leap February', () => {
      const december = overviewDays(
        'last_month',
        new Date('2027-01-10T06:00:00Z'),
        tz,
      ).days;
      expect([december[0], december[december.length - 1]]).toEqual([
        '2026-12-01',
        '2026-12-31',
      ]);
      expect(
        overviewDays('last_month', new Date('2028-03-05T06:00:00Z'), tz).days,
      ).toHaveLength(29);
    });

    it('ends the 90-day window today', () => {
      const { days, today } = overviewDays('last_90_days', now, tz);
      expect(days).toHaveLength(90);
      expect(days[89]).toBe(today);
      expect(days[0]).toBe('2026-08-20');
    });
  });

  it('reads instants as local calendar days', () => {
    expect(localDate(new Date('2026-11-04T20:00:00Z'), tz)).toBe('2026-11-05');
    expect(localDate(new Date('2026-11-04T10:00:00Z'), tz)).toBe('2026-11-04');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });

  describe('bucketOverview', () => {
    const days = ['2026-11-16', '2026-11-17', '2026-11-18'];
    const input = {
      days,
      today: '2026-11-17',
      appointmentDates: [
        '2026-11-16',
        '2026-11-16',
        '2026-11-18',
        // Outside the period: ignored.
        '2026-11-30',
      ],
      admissionDates: ['2026-11-17'],
      payments: [
        { date: '2026-11-16', amount: 499.5 },
        { date: '2026-11-16', amount: 0.25 },
        { date: '2026-11-17', amount: 1200 },
      ],
    };

    it('counts each day and ends admissions and revenue at today', () => {
      const out = bucketOverview({
        ...input,
        metrics: ['appointments', 'admissions', 'revenue'],
      });
      expect(out.days).toEqual([
        { date: '2026-11-16', appointments: 2, admissions: 0, revenue: 499.75 },
        { date: '2026-11-17', appointments: 0, admissions: 1, revenue: 1200 },
        // Tomorrow: the booking shows, unknown figures stay empty.
        {
          date: '2026-11-18',
          appointments: 1,
          admissions: null,
          revenue: null,
        },
      ]);
      expect(out.totals).toEqual({
        appointments: 3,
        admissions: 1,
        revenue: 1699.75,
      });
    });

    it('leaves out what the role may not see', () => {
      const out = bucketOverview({ ...input, metrics: ['appointments'] });
      expect(out.days[0]).toEqual({ date: '2026-11-16', appointments: 2 });
      expect(out.totals).toEqual({ appointments: 3 });
      expect(bucketOverview({ ...input, metrics: [] }).days[1]).toEqual({
        date: '2026-11-17',
      });
    });
  });
});
