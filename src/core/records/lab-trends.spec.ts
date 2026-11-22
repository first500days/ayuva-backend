import { buildLabTrends, parseNumber } from './lab-trends';

const at = (s: string) => new Date(`${s}T09:00:00Z`);

describe('lab trends', () => {
  it('reads the leading number of a lab value', () => {
    expect(parseNumber('7.2')).toBe(7.2);
    expect(parseNumber('< 0.5 mg/dL')).toBe(0.5);
    expect(parseNumber('Positive')).toBeNull();
  });

  it('builds a series per test and explains the latest against the range', () => {
    const [hba1c] = buildLabTrends([
      {
        at: at('2026-08-01'),
        labName: 'Metro Labs',
        values: [
          { name: 'HbA1c', value: '7.4', unit: '%', refLow: 4, refHigh: 5.6 },
        ],
      },
      {
        at: at('2026-11-01'),
        labName: 'Metro Labs',
        values: [
          { name: 'HbA1c', value: '6.5', unit: '%', refLow: 4, refHigh: 5.6 },
        ],
      },
    ]);
    expect(hba1c.points.map((p) => p.value)).toEqual([7.4, 6.5]);
    expect(hba1c.position).toBe('above');
    expect(hba1c.direction).toBe('down');
    expect(hba1c.towardsRange).toBe(true);
    expect(hba1c.explanation).toMatch(
      /^Your latest HbA1c is 6.5 %, above the lab’s usual range \(4–5.6 %\)\. It has gone down from 7.4 since .*, towards the usual range\. Your doctor can tell you what this means for you\.$/,
    );
  });

  it('puts out-of-range tests first and treats small changes as steady', () => {
    const trends = buildLabTrends([
      {
        at: at('2026-10-01'),
        values: [
          {
            name: 'Haemoglobin',
            value: '13.0',
            unit: 'g/dL',
            refLow: 12,
            refHigh: 16,
          },
          {
            name: 'TSH',
            value: '6.1',
            unit: 'mIU/L',
            refLow: 0.4,
            refHigh: 4.5,
          },
        ],
      },
      {
        at: at('2026-11-01'),
        values: [
          {
            name: 'Haemoglobin',
            value: '13.2',
            unit: 'g/dL',
            refLow: 12,
            refHigh: 16,
          },
        ],
      },
    ]);
    expect(trends.map((t) => t.name)).toEqual(['TSH', 'Haemoglobin']);
    expect(trends[1].direction).toBe('steady');
    expect(trends[1].explanation).toContain('stayed about the same');
    expect(trends[0].direction).toBe('single');
  });
});
