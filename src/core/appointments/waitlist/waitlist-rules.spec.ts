import { NOTIFY_AT_ONCE, pickWaiters, type WaitEntry } from './waitlist-rules';

const now = new Date('2026-11-14T08:00:00Z');
const slot = { day: '2026-11-16', at: new Date('2026-11-16T05:00:00Z') };
const e = (id: string, over: Partial<WaitEntry> = {}): WaitEntry => ({
  id,
  userId: `u-${id}`,
  createdAt: new Date(`2026-11-1${id.length}T00:00:00Z`),
  ...over,
});

describe('pickWaiters', () => {
  it('takes people whose window covers the slot, earliest first', () => {
    const picked = pickWaiters(
      [
        e('b', { createdAt: new Date('2026-11-12T00:00:00Z') }),
        e('a', {
          createdAt: new Date('2026-11-10T00:00:00Z'),
          from: '2026-11-15',
          to: '2026-11-20',
        }),
        e('c', { from: '2026-11-17' }),
        e('d', { to: '2026-11-15' }),
      ],
      slot,
      now,
    );
    expect(picked.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('skips anyone nudged in the last hour or already booked with the provider', () => {
    const picked = pickWaiters(
      [
        e('x', { lastNotifiedAt: new Date(now.getTime() - 10 * 60_000) }),
        e('y'),
        e('z'),
      ],
      slot,
      now,
      new Set(['u-z']),
    );
    expect(picked.map((p) => p.id)).toEqual(['y']);
  });

  it('caps a burst and ignores slots already in the past', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      e(`k${i}`, { createdAt: new Date(2026, 10, i + 1) }),
    );
    expect(pickWaiters(many, slot, now)).toHaveLength(NOTIFY_AT_ONCE);
    expect(
      pickWaiters(
        many,
        { day: '2026-11-13', at: new Date('2026-11-13T05:00:00Z') },
        now,
      ),
    ).toEqual([]);
  });
});
