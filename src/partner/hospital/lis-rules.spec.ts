import { allowedKinds, canMove, overTarget } from './lis-rules';

describe('LIS rules', () => {
  it('moves samples along the pipeline only', () => {
    expect(canMove('requested', 'collected')).toBe(true);
    expect(canMove('requested', 'received')).toBe(true);
    expect(canMove('collected', 'verified')).toBe(false);
    expect(canMove('resulted', 'verified')).toBe(true);
    expect(canMove('verified', 'processing')).toBe(false);
    expect(canMove('requested', 'rejected')).toBe(false);
  });

  it('measures turnaround against the priority target', () => {
    const received = new Date('2026-11-04T10:00:00Z');
    expect(overTarget('stat', received, new Date('2026-11-04T10:45:00Z'))).toBe(
      -15,
    );
    expect(overTarget('stat', received, new Date('2026-11-04T11:30:00Z'))).toBe(
      30,
    );
    expect(
      overTarget('urgent', received, new Date('2026-11-04T13:00:00Z')),
    ).toBe(-60);
    expect(overTarget('routine', undefined, new Date())).toBeNull();
  });

  it('accepts only addenda once a report is verified', () => {
    expect(allowedKinds('processing')).toContain('final');
    expect(allowedKinds('verified')).toEqual(['addendum', 'note']);
    expect(allowedKinds('requested')).toEqual([]);
  });
});
