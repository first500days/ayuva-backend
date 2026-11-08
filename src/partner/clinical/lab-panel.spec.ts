import {
  buildPanel,
  estimateEgfr,
  pointsFromText,
  type LabPoint,
} from './lab-panel';
import { blocksSigning, checkPrescription } from './rx-safety';

const NOW = new Date('2026-11-08T12:00:00Z');
const daysAgo = (d: number) =>
  new Date(NOW.getTime() - d * 86_400_000).toISOString();
const point = (
  parameter: string,
  value: number,
  unit: string | null,
  age = 1,
): LabPoint => ({ parameter, value, unit, at: daysAgo(age) });
const panel = (...points: LabPoint[]) => buildPanel(points, {}, NOW);

describe('lab panel', () => {
  it('reads common names and takes the newest value', () => {
    const p = panel(
      point('S. Creatinine', 1.1, 'mg/dL', 40),
      point('Serum Creatinine', 2.4, 'mg/dL', 2),
      point('Potassium', 5.8, 'mEq/L'),
      point('SGPT (ALT)', 210, 'U/L'),
      point('Total Bilirubin', 1.2, 'mg/dL'),
    );
    expect(p.creatinine?.value).toBe(2.4);
    expect(p.potassium?.value).toBe(5.8);
    expect(p.alt?.value).toBe(210);
    expect(p.bilirubin?.value).toBe(1.2);
  });

  it('keeps look-alike tests out', () => {
    const p = panel(
      point('Urine Creatinine', 90, 'mg/dL'),
      point('Direct Bilirubin', 0.2, 'mg/dL'),
      point('Lactate Dehydrogenase', 300, 'U/L'),
      point('Mean Platelet Volume', 9, 'fL'),
    );
    expect(p).toEqual({});
  });

  it('puts counts and SI units on one scale', () => {
    const p = panel(
      point('Creatinine', 212, 'µmol/L'),
      point('Platelet Count', 0.45, 'lakh/cumm'),
      point('WBC', 14200, '/cumm'),
      point('CRP', 12, 'mg/dL'),
      point('Lactate', 36, 'mg/dL'),
    );
    expect(p.creatinine?.value).toBeCloseTo(2.4, 1);
    expect(p.platelets?.value).toBeCloseTo(45, 5);
    expect(p.wbc?.value).toBeCloseTo(14.2, 5);
    expect(p.crp?.value).toBe(120);
    expect(p.lactate?.value).toBe(4);
  });

  it('skips a count it cannot read safely', () => {
    expect(panel(point('Platelets', 1.5, null)).platelets).toBeUndefined();
  });

  it('calculates eGFR with CKD-EPI 2021', () => {
    // Worked by hand from the published equation.
    expect(estimateEgfr(1.0, 50, 'male')).toBe(92);
    expect(estimateEgfr(1.0, 50, 'female')).toBe(69);
    expect(estimateEgfr(2.4, 65, 'male')).toBe(29);
  });

  it('marks a calculated eGFR, and needs age and sex to calculate it', () => {
    const points = [point('Creatinine', 2.4, 'mg/dL')];
    const known = buildPanel(points, { age: 65, gender: 'Male' }, NOW);
    expect(known.egfr).toMatchObject({ value: 29, estimated: true });
    expect(buildPanel(points, { age: 65 }, NOW).egfr).toBeUndefined();
    expect(buildPanel(points, { gender: 'male' }, NOW).egfr).toBeUndefined();
  });

  it('prefers an eGFR the lab reported', () => {
    const p = buildPanel(
      [point('eGFR', 52, 'mL/min'), point('Creatinine', 2.4, 'mg/dL')],
      { age: 65, gender: 'male' },
      NOW,
    );
    expect(p.egfr).toMatchObject({ value: 52 });
    expect(p.egfr?.estimated).toBeUndefined();
  });

  it('reads values out of free-text results', () => {
    const points = pointsFromText(
      'Creatinine: 2.4 mg/dL, K+ 5.8 mmol/L; SGPT = 45 U/L. Patient stable.',
      daysAgo(1),
    );
    expect(points.map((p) => [p.parameter, p.value, p.unit])).toEqual([
      ['Creatinine', 2.4, 'mg/dL'],
      ['K+', 5.8, 'mmol/L'],
      ['SGPT', 45, 'U/L'],
    ]);
  });
});

describe('organ-function prescription checks', () => {
  const check = (medicine: string, ...points: LabPoint[]) =>
    checkPrescription({
      items: [{ medicine }],
      allergies: [],
      activeMedicines: [],
      labs: buildPanel(points, {}, NOW),
    }).warnings;

  it('flags metformin by kidney function, citing the value', () => {
    const [w] = check('Glycomet 500', point('eGFR', 24, 'mL/min'));
    expect(w).toMatchObject({
      severity: 'contraindicated',
      kind: 'organ',
      lines: [0],
    });
    expect(w.message).toContain('eGFR 24');
    expect(blocksSigning(w)).toBe(true);
    expect(check('Metformin', point('eGFR', 40, 'mL/min'))[0].severity).toBe(
      'major',
    );
    expect(check('Metformin', point('eGFR', 70, 'mL/min'))).toEqual([]);
  });

  it('flags NSAIDs in kidney disease but not low-dose aspirin', () => {
    expect(check('Brufen 400', point('eGFR', 25, 'x'))[0].severity).toBe(
      'major',
    );
    expect(check('Ecosprin 75', point('eGFR', 25, 'x'))).toEqual([]);
  });

  it('flags potassium-raising drugs in hyperkalaemia', () => {
    expect(
      check('Aldactone 25', point('Potassium', 5.8, 'mmol/L'))[0].severity,
    ).toBe('contraindicated');
    expect(
      check('Telma 40', point('Potassium', 5.8, 'mmol/L'))[0].severity,
    ).toBe('major');
    expect(check('Telma 40', point('Potassium', 4.2, 'mmol/L'))).toEqual([]);
  });

  it('flags digoxin with low potassium', () => {
    expect(
      check('Lanoxin', point('Potassium', 3.1, 'mmol/L'))[0].severity,
    ).toBe('major');
  });

  it('uses the lab’s own upper limit for liver enzymes when printed', () => {
    const narrow: LabPoint = { ...point('ALT', 130, 'U/L'), refHigh: 35 };
    expect(check('Atorva 10', narrow)[0].severity).toBe('major');
    const wide: LabPoint = { ...point('ALT', 130, 'U/L'), refHigh: 50 };
    expect(check('Atorva 10', wide)).toEqual([]);
  });

  it('flags warfarin with a high INR and bleeding risks with low platelets', () => {
    expect(check('Warf 5', point('INR', 4.6, null))[0].severity).toBe('major');
    expect(
      check('Clopilet 75', point('Platelets', 42, '10^3/uL'))[0].severity,
    ).toBe('major');
  });

  it('ignores stale values', () => {
    expect(check('Metformin', point('eGFR', 24, 'x', 120))).toEqual([]);
    expect(check('Telma', point('Potassium', 6.1, 'mmol/L', 45))).toEqual([]);
    expect(check('Telma', point('Potassium', 6.1, 'mmol/L', 20))).toHaveLength(
      1,
    );
  });

  it('gives one warning per lab value, the most severe', () => {
    const w = check('Metformin', point('eGFR', 20, 'x'));
    expect(w).toHaveLength(1);
    expect(w[0].severity).toBe('contraindicated');
  });

  it('stays quiet with no labs or for medicines it does not know', () => {
    expect(check('Metformin')).toEqual([]);
    expect(check('Vitamin D3', point('eGFR', 20, 'x'))).toEqual([]);
  });

  it('treats home medicines like any other active medicine', () => {
    const { warnings } = checkPrescription({
      items: [{ medicine: 'Warfarin 5 mg' }],
      allergies: [],
      activeMedicines: [
        { medicine: 'Brufen 400', source: "patient's home medicines" },
      ],
    });
    expect(warnings[0]).toMatchObject({
      kind: 'interaction',
      severity: 'major',
    });
    expect(warnings[0].with).toContain('home medicines');
  });
});
