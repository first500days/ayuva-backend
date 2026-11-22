import { expiryState, planIssue, usableQuantity } from './stock';

const today = new Date('2026-11-04T10:00:00');
const d = (s: string) => new Date(`${s}T00:00:00`);
const batch = (
  id: string,
  quantity: number,
  expiry: string | null,
  received = '2026-01-01',
) => ({
  id,
  batchNo: id.toUpperCase(),
  quantity,
  expiryDate: expiry ? d(expiry) : null,
  receivedAt: d(received),
});

describe('stock rules', () => {
  it('issues the batch that expires first', () => {
    const plan = planIssue(
      [
        batch('late', 50, '2027-06-30'),
        batch('soon', 10, '2026-12-31'),
        batch('undated', 100, null),
      ],
      25,
      today,
    );
    expect(plan.picks.map((p) => [p.batchNo, p.quantity])).toEqual([
      ['SOON', 10],
      ['LATE', 15],
    ]);
    expect(plan.short).toBe(0);
  });

  it('never issues expired or empty batches and reports the shortfall', () => {
    const plan = planIssue(
      [
        batch('expired', 40, '2026-11-03'),
        batch('empty', 0, '2027-01-01'),
        batch('ok', 5, '2027-01-01'),
      ],
      12,
      today,
    );
    expect(plan.picks.map((p) => p.batchNo)).toEqual(['OK']);
    expect(plan.short).toBe(7);
  });

  it('treats a batch expiring today as still usable', () => {
    const plan = planIssue([batch('today', 3, '2026-11-04')], 2, today);
    expect(plan.picks).toHaveLength(1);
  });

  it('draws from a chosen batch first', () => {
    const plan = planIssue(
      [batch('a', 10, '2026-12-01'), batch('b', 10, '2027-12-01')],
      12,
      today,
      'b',
    );
    expect(plan.picks.map((p) => [p.batchNo, p.quantity])).toEqual([
      ['B', 10],
      ['A', 2],
    ]);
  });

  it('breaks expiry ties by oldest received', () => {
    const plan = planIssue(
      [
        batch('new', 5, null, '2026-10-01'),
        batch('old', 5, null, '2026-02-01'),
      ],
      5,
      today,
    );
    expect(plan.picks[0].batchNo).toBe('OLD');
  });

  it('classifies expiry', () => {
    expect(expiryState(d('2026-11-03'), today)).toBe('expired');
    expect(expiryState(d('2026-12-15'), today)).toBe('expiring');
    expect(expiryState(d('2027-12-15'), today)).toBe('ok');
    expect(expiryState(null, today)).toBe('none');
  });

  it('counts only usable stock', () => {
    expect(
      usableQuantity(
        [batch('x', 4, '2026-01-01'), batch('y', 6, '2027-01-01')],
        today,
      ),
    ).toBe(6);
  });
});
