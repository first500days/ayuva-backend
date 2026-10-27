import { freshCritical, resultChanges, resultRows } from './result-changes';

const report = (potassium: string, sodium: string, flag = 'none') =>
  resultRows([
    {
      name: 'Electrolytes',
      values: [
        { name: 'Potassium', value: potassium, unit: 'mmol/L', flag },
        { name: 'Sodium', value: sodium, unit: 'mmol/L', flag: 'none' },
      ],
    },
  ]);

describe('resultRows', () => {
  it('keys repeated parameters separately', () => {
    const rows = resultRows([
      { name: 'CBC', values: [{ name: 'Hb', value: '13' }] },
      { name: 'CBC', values: [{ name: 'Hb', value: '12' }] },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['CBC|Hb#0', 'CBC|Hb#1']);
  });
});

describe('resultChanges', () => {
  it('counts first entries as entered, not overrides', () => {
    const c = resultChanges(report('', ''), report('4.1', '140'));
    expect(c.entered.map((r) => r.name)).toEqual(['Potassium', 'Sodium']);
    expect(c.overridden).toEqual([]);
  });

  it('records a changed value as an override with its old value', () => {
    const c = resultChanges(report('4.1', '140'), report('6.8', '140'));
    expect(c.entered).toEqual([]);
    expect(c.overridden).toMatchObject([
      { from: '4.1', row: { name: 'Potassium', value: '6.8' } },
    ]);
  });

  it('treats clearing a value as an override', () => {
    const c = resultChanges(report('4.1', '140'), report('', '140'));
    expect(c.overridden).toMatchObject([{ from: '4.1', row: { value: '' } }]);
  });

  it('ignores untouched values and whitespace', () => {
    const c = resultChanges(report('4.1', '140'), report(' 4.1 ', '140'));
    expect(c).toEqual({ entered: [], overridden: [] });
  });
});

describe('freshCritical', () => {
  it('alerts once per critical value', () => {
    const rows = report('6.8', '140', 'critical_high');
    expect(freshCritical(rows, []).map((r) => r.key)).toEqual([
      'Electrolytes|Potassium#0',
    ]);
    expect(freshCritical(rows, ['Electrolytes|Potassium#0'])).toEqual([]);
  });

  it('ignores values that are only high or low', () => {
    expect(freshCritical(report('5.4', '140', 'high'), [])).toEqual([]);
  });
});
