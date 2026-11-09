import {
  type PastVisit,
  expectedDemand,
  rosteredCount,
  suggestShifts,
} from './staffing-forecast';

const MON = 0;
const visits = (
  weekday: number,
  hour: number,
  perWeek: number,
  weeks = 8,
): PastVisit[] =>
  Array.from({ length: weeks }, (_, weeksAgo) =>
    Array.from({ length: perWeek }, () => ({ weekday, hour, weeksAgo })),
  ).flat();

describe('expectedDemand', () => {
  it('returns the steady rate when every week is the same', () => {
    expect(expectedDemand(visits(MON, 10, 6))[MON][10]).toBeCloseTo(6, 5);
  });

  it('weights recent weeks more heavily', () => {
    const recent = expectedDemand([{ weekday: MON, hour: 10, weeksAgo: 0 }]);
    const older = expectedDemand([{ weekday: MON, hour: 10, weeksAgo: 7 }]);
    expect(recent[MON][10]).toBeGreaterThan(older[MON][10]);
  });

  it('counts weeks with no visits as zero, so one busy week fades out', () => {
    const value = expectedDemand(visits(MON, 10, 8, 1))[MON][10];
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(8);
  });

  it('ignores visits outside the window', () => {
    expect(
      expectedDemand([{ weekday: MON, hour: 10, weeksAgo: 8 }])[MON][10],
    ).toBe(0);
  });
});

describe('rosteredCount', () => {
  it('counts each person for every hour of their block', () => {
    const m = rosteredCount([
      { dutySchedule: [{ day: 'mon', start: '09:00', end: '12:00' }] },
      { dutySchedule: [{ day: 'mon', start: '10:00', end: '11:00' }] },
    ]);
    expect(m[MON].slice(8, 13)).toEqual([0, 1, 2, 1, 0]);
  });

  it('counts a part-hour at the end of a shift', () => {
    const m = rosteredCount([
      { dutySchedule: [{ day: 'tue', start: '09:00', end: '10:30' }] },
    ]);
    expect(m[1].slice(9, 11)).toEqual([1, 1]);
  });

  it('skips a day it does not recognise', () => {
    const m = rosteredCount([
      { dutySchedule: [{ day: 'someday', start: '09:00', end: '10:00' }] },
    ]);
    expect(m.flat().every((v) => v === 0)).toBe(true);
  });
});

describe('suggestShifts', () => {
  const roster = (from: number, to: number) => {
    const m = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    for (let h = from; h < to; h++) m[MON][h] = 1;
    return m;
  };

  it('suggests nothing when the roster covers demand', () => {
    expect(
      suggestShifts(expectedDemand(visits(MON, 10, 3)), roster(9, 17)),
    ).toEqual([]);
  });

  it('asks for more people when an hour is over capacity', () => {
    const [s] = suggestShifts(
      expectedDemand(visits(MON, 10, 9)),
      roster(9, 17),
    );
    expect(s).toMatchObject({
      day: 'Monday',
      start: '10:00',
      end: '11:00',
      rostered: 1,
      extra: 2,
    });
    expect(s.expectedPeak).toBeCloseTo(9, 1);
  });

  it('joins neighbouring short hours into one shift', () => {
    const demand = expectedDemand([
      ...visits(MON, 18, 5),
      ...visits(MON, 19, 5),
    ]);
    const [s, ...rest] = suggestShifts(demand, roster(9, 17));
    expect(rest).toEqual([]);
    expect(s).toMatchObject({ start: '18:00', end: '20:00', rostered: 0 });
  });

  it('keeps separate gaps apart', () => {
    const demand = expectedDemand([
      ...visits(MON, 7, 5),
      ...visits(MON, 19, 5),
    ]);
    expect(suggestShifts(demand, roster(9, 17))).toHaveLength(2);
  });

  it('ignores an hour too quiet to staff', () => {
    expect(
      suggestShifts(expectedDemand(visits(MON, 22, 1, 2)), roster(9, 17)),
    ).toEqual([]);
  });

  it('puts the biggest shortfall first', () => {
    const demand = expectedDemand([
      ...visits(MON, 7, 5),
      ...visits(MON, 19, 13),
    ]);
    const out = suggestShifts(demand, roster(9, 17));
    expect(out[0].start).toBe('19:00');
    expect(out[0].extra).toBeGreaterThan(out[1].extra);
  });
});
