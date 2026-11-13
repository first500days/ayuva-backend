import { dischargeReadiness } from './discharge-readiness';

const now = new Date('2026-11-13T10:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe('dischargeReadiness', () => {
  it('reaches ready when the stay is done, observations settled, labs back and billing cleared', () => {
    const r = dischargeReadiness({
      admittedAt: daysAgo(4),
      expectedDischargeAt: daysAgo(0),
      now,
      warning: 'none',
      pendingLabs: 0,
      claim: 'cleared',
    });
    expect(r.percent).toBe(100);
    expect(r.ready).toBe(true);
  });

  it('holds back an unsettled patient whatever the day count', () => {
    const r = dischargeReadiness({
      admittedAt: daysAgo(5),
      now,
      warning: 'high',
      pendingLabs: 0,
      claim: 'none',
    });
    expect(r.percent).toBe(65);
    expect(r.ready).toBe(false);
    expect(r.factors.find((f) => f.label === 'Observations')!.points).toBe(0);
  });

  it('counts pending results and an open claim', () => {
    const r = dischargeReadiness({
      admittedAt: daysAgo(1),
      now,
      warning: null,
      pendingLabs: 2,
      claim: 'pending',
    });
    // 1 of ~3 days → 10, unknown observations → 10, labs pending → 0, claim pending → 5
    expect(r.percent).toBe(25);
    expect(r.factors.find((f) => f.label === 'Investigations')!.detail).toBe(
      '2 results pending',
    );
  });
});
