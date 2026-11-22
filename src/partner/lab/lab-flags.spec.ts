import { computeFlag, isCriticalFlag } from './lab-flags';

describe('computeFlag', () => {
  const hb = { refLow: 12, refHigh: 17, criticalLow: 7, criticalHigh: 20 };

  it('flags numeric values against reference and critical limits', () => {
    expect(computeFlag({ value: '13.5', ...hb })).toBe('normal');
    expect(computeFlag({ value: '11.2', ...hb })).toBe('low');
    expect(computeFlag({ value: '18', ...hb })).toBe('high');
    expect(computeFlag({ value: '6.1', ...hb })).toBe('critical_low');
    expect(computeFlag({ value: '21', ...hb })).toBe('critical_high');
  });

  it('accepts thousands separators and comparator prefixes', () => {
    expect(computeFlag({ value: '1,200', refHigh: 1000 })).toBe('high');
    expect(computeFlag({ value: '< 5', refLow: 0, refHigh: 5 })).toBe('normal');
  });

  it('handles one-sided ranges', () => {
    expect(computeFlag({ value: '35', refLow: 40 })).toBe('low');
    expect(computeFlag({ value: '180', refHigh: 200 })).toBe('normal');
  });

  it('compares text results with the expected text', () => {
    expect(computeFlag({ value: 'negative', refText: 'Negative' })).toBe(
      'normal',
    );
    expect(computeFlag({ value: 'Trace', refText: 'Negative' })).toBe(
      'abnormal',
    );
  });

  it('does not flag blanks or values without a range', () => {
    expect(computeFlag({ value: '', ...hb })).toBe('none');
    expect(computeFlag({ value: '72' })).toBe('none');
    expect(computeFlag({ value: 'No acute abnormality' })).toBe('none');
  });

  it('identifies critical flags', () => {
    expect(isCriticalFlag('critical_high')).toBe(true);
    expect(isCriticalFlag('high')).toBe(false);
  });
});
