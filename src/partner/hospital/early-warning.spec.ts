import type { LabPanel, Reading } from '../clinical/lab-panel';
import {
  assess,
  inflammationAlerts,
  median,
  news2,
  sirs,
} from './early-warning';

const reading = (value: number, ageDays = 0.5): Reading => ({
  value,
  unit: '',
  at: '2026-11-08T10:00:00Z',
  ageDays,
});

const NORMAL = {
  rr: 16,
  spo2: 98,
  onOxygen: false,
  tempC: 37,
  systolic: 120,
  hr: 75,
  avpu: 'A' as const,
};

describe('NEWS2', () => {
  it('scores a well patient 0', () => {
    expect(news2(NORMAL)).toMatchObject({
      total: 0,
      band: 'low',
      missing: [],
    });
  });

  // Each row of the published chart, at the edges of every band.
  it.each([
    [8, 3],
    [9, 1],
    [11, 1],
    [12, 0],
    [20, 0],
    [21, 2],
    [24, 2],
    [25, 3],
  ])('respiratory rate %d scores %d', (rr, score) => {
    expect(news2({ rr }).parts.rr).toBe(score);
  });

  it.each([
    [91, 3],
    [92, 2],
    [93, 2],
    [94, 1],
    [95, 1],
    [96, 0],
  ])('SpO2 %d scores %d', (spo2, score) => {
    expect(news2({ spo2 }).parts.spo2).toBe(score);
  });

  it.each([
    [90, 3],
    [91, 2],
    [100, 2],
    [101, 1],
    [110, 1],
    [111, 0],
    [219, 0],
    [220, 3],
  ])('systolic %d scores %d', (systolic, score) => {
    expect(news2({ systolic }).parts.systolic).toBe(score);
  });

  it.each([
    [40, 3],
    [41, 1],
    [50, 1],
    [51, 0],
    [90, 0],
    [91, 1],
    [110, 1],
    [111, 2],
    [130, 2],
    [131, 3],
  ])('heart rate %d scores %d', (hr, score) => {
    expect(news2({ hr }).parts.hr).toBe(score);
  });

  it.each([
    [35, 3],
    [35.1, 1],
    [36, 1],
    [36.1, 0],
    [38, 0],
    [38.1, 1],
    [39, 1],
    [39.1, 2],
  ])('temperature %d scores %d', (tempC, score) => {
    expect(news2({ tempC }).parts.tempC).toBe(score);
  });

  it('scores oxygen and consciousness', () => {
    expect(news2({ onOxygen: true }).parts.oxygen).toBe(2);
    expect(news2({ onOxygen: false }).parts.oxygen).toBe(0);
    expect(news2({ avpu: 'A' }).parts.consciousness).toBe(0);
    expect(news2({ avpu: 'C' }).parts.consciousness).toBe(3);
    expect(news2({ avpu: 'U' }).parts.consciousness).toBe(3);
  });

  it('bands the total, with any single 3 at least low-medium', () => {
    expect(news2({ hr: 95 }).band).toBe('low');
    expect(news2({ hr: 135 }).band).toBe('low-medium');
    expect(news2({ hr: 135, tempC: 39.5 }).band).toBe('medium');
    expect(news2({ hr: 135, tempC: 39.5, rr: 22 }).band).toBe('high');
  });

  it('names what it could not score', () => {
    expect(news2({ hr: 80, spo2: 97 }).missing).toEqual([
      'rr',
      'oxygen',
      'systolic',
      'consciousness',
      'tempC',
    ]);
  });
});

describe('SIRS', () => {
  it('counts each criterion', () => {
    expect(sirs({ tempC: 38.6, hr: 112, rr: 24 }, reading(15)).met).toBe(4);
    expect(sirs(NORMAL).met).toBe(0);
  });

  it('counts a low temperature and a low WBC too', () => {
    expect(sirs({ tempC: 35.5 }, reading(3)).met).toBe(2);
  });
});

describe('inflammation markers', () => {
  it('lists only raised values', () => {
    const labs: LabPanel = { crp: reading(140), lactate: reading(1.2) };
    expect(inflammationAlerts(labs)).toEqual(['CRP 140 mg/L']);
  });

  it('ignores anything older than two days', () => {
    expect(inflammationAlerts({ crp: reading(140, 3) })).toEqual([]);
  });

  it('knows procalcitonin and white cells in both directions', () => {
    expect(
      inflammationAlerts({ procalcitonin: reading(0.5), wbc: reading(2.5) }),
    ).toHaveLength(2);
    expect(
      inflammationAlerts({ procalcitonin: reading(0.4), wbc: reading(9) }),
    ).toEqual([]);
  });
});

describe('assessment', () => {
  const sick = { ...NORMAL, hr: 125, rr: 26, tempC: 39.2 };

  it('stays quiet for a well patient', () => {
    expect(assess(NORMAL, {}).level).toBe('none');
  });

  it('raises the sepsis screen only with both physiology and lab evidence', () => {
    expect(assess(sick, { crp: reading(180) }).level).toBe('sepsis_screen');
  });

  it('never raises the sepsis screen on bedside numbers alone', () => {
    const r = assess(sick, {});
    expect(r.level).toBe('high');
    expect(r.title).not.toMatch(/sepsis/i);
  });

  it('never raises the sepsis screen on a lab result alone', () => {
    expect(assess(NORMAL, { crp: reading(180) }).level).toBe('none');
  });

  it('does not act on an old lab result', () => {
    expect(assess(sick, { crp: reading(180, 5) }).level).toBe('high');
  });

  it('counts two SIRS criteria as deranged physiology', () => {
    const r = assess(
      { hr: 95, rr: 22, spo2: 97, systolic: 125, tempC: 37, avpu: 'A' },
      { procalcitonin: reading(2) },
    );
    expect(r.news2.total).toBeLessThan(5);
    expect(r.level).toBe('sepsis_screen');
  });

  it('flags a raised score without calling it sepsis', () => {
    const r = assess({ ...NORMAL, hr: 135 }, {});
    expect(r.level).toBe('watch');
    expect(r.title).toContain('NEWS2 3');
  });

  it('never words the result as a diagnosis', () => {
    const r = assess(sick, { crp: reading(180) });
    expect(r.title).toMatch(/screening criteria/i);
    expect(r.title).toMatch(/clinical review/i);
    expect(r.title).not.toMatch(/has sepsis|diagnos/i);
  });

  it('lists the readings behind the result, worst first', () => {
    const r = assess(sick, { crp: reading(180) });
    expect(r.factors[0]).toMatch(/Respiratory rate 26/);
    expect(r.factors).toContain('CRP 180 mg/L');
  });
});

describe('median', () => {
  it('takes the middle value, so one bad sample is ignored', () => {
    expect(median([72, 74, 240, 73, 75])).toBe(74);
    expect(median([70, 80])).toBe(75);
    expect(median([])).toBeUndefined();
  });
});
