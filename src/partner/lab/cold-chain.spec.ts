import { parseLoggerCsv, summarize } from './cold-chain';

const t = (min: number) => new Date(Date.UTC(2026, 10, 5, 3, 0) + min * 60_000);

describe('cold chain', () => {
  it('no readings is not a pass', () => {
    expect(summarize([], 2, 8).verdict).toBe('no_data');
  });

  it('all readings inside the range pass', () => {
    const s = summarize(
      [
        { at: t(0), tempC: 4.1 },
        { at: t(30), tempC: 6.8 },
      ],
      2,
      8,
    );
    expect(s).toMatchObject({
      verdict: 'ok',
      minC: 4.1,
      maxC: 6.8,
      outOfRange: 0,
      minutesOut: 0,
    });
  });

  it('times an excursion until the next in-range reading or the end', () => {
    const s = summarize(
      [
        { at: t(0), tempC: 5 },
        { at: t(20), tempC: 9.5 },
        { at: t(35), tempC: 10.2 },
        { at: t(50), tempC: 7 },
        { at: t(80), tempC: 1.2 },
      ],
      2,
      8,
      t(95),
    );
    expect(s.verdict).toBe('excursion');
    expect(s.outOfRange).toBe(3);
    expect(s.minutesOut).toBe(30 + 15);
    expect(s.firstOutAt).toEqual(t(20));
  });

  it('reads logger exports with a header, local times and junk lines', () => {
    const { readings, skipped } = parseLoggerCsv(
      'Time,Temperature (C)\n2026-11-05 08:30,4.2\n2026-11-05 08:40:00;5.1\n"2026-11-05T03:20:00Z","6"\nnot a line\n',
    );
    expect(readings.map((r) => [r.at.toISOString(), r.tempC])).toEqual([
      ['2026-11-05T03:00:00.000Z', 4.2],
      ['2026-11-05T03:10:00.000Z', 5.1],
      ['2026-11-05T03:20:00.000Z', 6],
    ]);
    expect(skipped).toBe(2);
  });
});
