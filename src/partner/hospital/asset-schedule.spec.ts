import { dueState, nextDue } from './asset-schedule';

describe('equipment schedule', () => {
  const today = new Date('2026-11-04T09:00:00');

  it('works out the next due date from the last service', () => {
    expect(nextDue(new Date('2026-08-01T00:00:00'), 90)?.toISOString()).toBe(
      new Date('2026-10-30T00:00:00').toISOString(),
    );
    expect(nextDue(null, 90)).toBeUndefined();
    expect(nextDue(new Date(), 0)).toBeUndefined();
  });

  it('classifies due dates', () => {
    expect(dueState(new Date('2026-11-03T00:00:00'), today)).toBe('overdue');
    expect(dueState(new Date('2026-11-04T00:00:00'), today)).toBe('due');
    expect(dueState(new Date('2026-11-15T00:00:00'), today)).toBe('due');
    expect(dueState(new Date('2026-12-30T00:00:00'), today)).toBe('ok');
    expect(dueState(undefined, today)).toBe('none');
  });
});
