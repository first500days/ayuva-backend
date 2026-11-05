import type { ResultRow } from './result-changes';
import {
  analyteOf,
  contaminationChecks,
  deltaChecks,
  resultChecks,
} from './result-checks';

const row = (
  name: string,
  value: string,
  unit: string | null,
  flag = 'none',
): ResultRow => ({ key: `T|${name}#0`, test: 'T', name, value, unit, flag });
const daysAgo = (n: number, now: Date) =>
  new Date(now.getTime() - n * 86_400_000);

describe('result checks', () => {
  const now = new Date('2026-11-05T06:00:00Z');

  it('recognises analytes by common names, not look-alikes', () => {
    expect(analyteOf('Haemoglobin (Hb)')).toBe('haemoglobin');
    expect(analyteOf('HbA1c')).toBe('hba1c');
    expect(analyteOf('Serum Potassium')).toBe('potassium');
    expect(analyteOf('Ionised Calcium')).toBeNull();
    expect(analyteOf('Creatinine Clearance')).toBeNull();
    expect(analyteOf('Urine Glucose')).toBeNull();
    expect(analyteOf('Fasting Blood Sugar')).toBe('glucose');
  });

  it('flags an implausible change inside the window, in the same unit only', () => {
    const history = [
      { name: 'Haemoglobin', unit: 'g/dL', value: 13.1, at: daysAgo(3, now) },
      { name: 'MCV', unit: 'fL', value: 82, at: daysAgo(20, now) },
    ];
    const checks = deltaChecks(
      [row('Haemoglobin', '9.4', 'g/dL'), row('MCV', '95', 'fL')],
      history,
      now,
    );
    expect(checks.map((c) => c.code)).toEqual([
      'delta:haemoglobin',
      'delta:mcv',
    ]);
    expect(checks[0].message).toMatch(
      /13\.1 → 9\.4 g\/dL \(-28%\) since 2 Nov 2026/,
    );
    expect(
      deltaChecks([row('Haemoglobin', '94', 'g/L')], history, now),
    ).toHaveLength(0);
  });

  it('ignores changes outside the window or within limits', () => {
    const history = [
      { name: 'Potassium', unit: 'mmol/L', value: 3.6, at: daysAgo(10, now) },
      { name: 'Sodium', unit: 'mmol/L', value: 138, at: daysAgo(1, now) },
    ];
    expect(
      deltaChecks(
        [row('Potassium', '5.5', 'mmol/L'), row('Sodium', '141', 'mEq/L')],
        history,
        now,
      ),
    ).toHaveLength(0);
  });

  it('HbA1c cannot move 2 points in weeks', () => {
    const checks = deltaChecks(
      [row('HbA1c', '6.1', '%')],
      [
        {
          name: 'Glycated Haemoglobin',
          unit: '%',
          value: 8.9,
          at: daysAgo(30, now),
        },
      ],
      now,
    );
    expect(checks[0]?.code).toBe('delta:hba1c');
  });

  it('spots EDTA contamination in either calcium unit', () => {
    const mg = contaminationChecks([
      row('Potassium', '7.8', 'mmol/L', 'critical_high'),
      row('Calcium', '4.1', 'mg/dL', 'critical_low'),
    ]);
    const mmol = contaminationChecks([
      row('Potassium', '7.8', 'mmol/L', 'critical_high'),
      row('Calcium', '1.02', 'mmol/L', 'critical_low'),
    ]);
    expect(mg.map((c) => [c.code, c.severity])).toEqual([['edta', 'hold']]);
    expect(mmol[0]?.code).toBe('edta');
  });

  it('spots a dextrose drip only with diluted companions', () => {
    expect(
      contaminationChecks([
        row('Glucose (Random)', '820', 'mg/dL', 'critical_high'),
        row('Sodium', '128', 'mmol/L', 'low'),
      ]).map((c) => c.code),
    ).toEqual(['dextrose_drip']);
    expect(
      contaminationChecks([row('Glucose (Random)', '520', 'mg/dL', 'high')]),
    ).toHaveLength(0);
  });

  it('haemolysis and delayed separation are review-level', () => {
    const h = contaminationChecks([
      row('Potassium', '6.1', 'mmol/L', 'high'),
      row('LDH', '780', 'U/L', 'high'),
    ]);
    expect(h.map((c) => [c.code, c.severity])).toEqual([
      ['haemolysis', 'review'],
    ]);
    const d = contaminationChecks([
      row('Potassium', '6.2', 'mmol/L', 'high'),
      row('Glucose', '2.1', 'mmol/L', 'low'),
    ]);
    expect(d.map((c) => c.code)).toEqual(['delayed_separation']);
  });

  it('a normal panel raises nothing', () => {
    expect(
      resultChecks(
        [
          row('Potassium', '4.2', 'mmol/L'),
          row('Calcium', '9.4', 'mg/dL'),
          row('Glucose', '96', 'mg/dL'),
          row('Remarks', 'Clear', null),
        ],
        [
          {
            name: 'Potassium',
            unit: 'mmol/L',
            value: 4.0,
            at: daysAgo(1, now),
          },
        ],
        now,
      ),
    ).toEqual([]);
  });
});
