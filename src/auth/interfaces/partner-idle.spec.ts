import { partnerIdleExpired } from './jwt-payload.interface';

describe('partnerIdleExpired (10-minute clinical portal sign-out)', () => {
  const now = Date.parse('2026-11-14T10:00:00Z');
  const ago = (ms: number) => new Date(now - ms);

  it('keeps a session with recent activity', () => {
    expect(partnerIdleExpired(ago(9 * 60_000), now)).toBe(false);
  });

  it('allows for the once-a-minute activity report before refusing', () => {
    expect(partnerIdleExpired(ago(10 * 60_000 + 30_000), now)).toBe(false);
  });

  it('ends a session idle past 10 minutes plus the grace', () => {
    expect(partnerIdleExpired(ago(12 * 60_000), now)).toBe(true);
  });

  it('leaves sessions from before activity was tracked alone', () => {
    expect(partnerIdleExpired(undefined, now)).toBe(false);
  });
});
