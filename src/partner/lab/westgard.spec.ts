import { evaluateRun, qcStats } from './westgard';

// Glucose level 1: target 100 mg/dL, SD 4.
const ev = (value: number, history: number[] = []) =>
  evaluateRun(value, 100, 4, history);

describe('Westgard rules', () => {
  it('accepts results within 2 SD', () => {
    expect(ev(103)).toEqual({ z: 0.75, rules: [], status: 'accept' });
  });

  it('1-2s is a warning, 1-3s a rejection', () => {
    expect(ev(109)).toMatchObject({ rules: ['1-2s'], status: 'warning' });
    expect(ev(113)).toMatchObject({ rules: ['1-3s'], status: 'reject' });
    expect(ev(87).rules).toEqual(['1-3s']);
  });

  it('2-2s needs two in a row on the same side', () => {
    expect(ev(109, [109.5])).toMatchObject({
      rules: ['2-2s'],
      status: 'reject',
    });
    expect(ev(109, [91]).rules).toContain('R-4s');
    expect(ev(109, [91]).rules).not.toContain('2-2s');
  });

  it('R-4s catches a large swing between runs', () => {
    // z −1.9 then +2.15: a 4.05 SD swing, neither beyond 3 SD.
    expect(ev(108.6, [92.4])).toMatchObject({
      rules: ['R-4s'],
      status: 'reject',
    });
  });

  it('4-1s catches a shift of four beyond 1 SD', () => {
    expect(ev(105, [105, 106, 104.5])).toMatchObject({
      rules: ['4-1s'],
      status: 'reject',
    });
    expect(ev(105, [105, 99, 104.5]).status).toBe('accept');
  });

  it('10x catches a drift to one side', () => {
    const nine = [101, 102, 101, 103, 101, 102, 101, 101, 102];
    expect(ev(101, nine)).toMatchObject({ rules: ['10x'], status: 'reject' });
    expect(ev(99, nine).status).toBe('accept');
  });

  it('observed statistics', () => {
    expect(qcStats([98, 100, 102])).toEqual({ n: 3, mean: 100, sd: 2, cv: 2 });
    expect(qcStats([100])).toEqual({ n: 1, mean: 100, sd: null, cv: null });
    expect(qcStats([])).toEqual({ n: 0, mean: null, sd: null, cv: null });
  });
});
