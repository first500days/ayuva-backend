import { isUnrecognised, networkOf } from './network-flags';

describe('networkOf', () => {
  it('groups addresses by /24 and ignores private ones', () => {
    expect(networkOf('203.0.113.7')).toBe('203.0.113.x');
    expect(networkOf('::ffff:203.0.113.9')).toBe('203.0.113.x');
    expect(networkOf('10.0.0.4')).toBeNull();
    expect(networkOf('127.0.0.1')).toBeNull();
    expect(networkOf('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48');
  });
});

describe('isUnrecognised', () => {
  const d = (s: string) => new Date(`2026-11-${s}T10:00:00Z`);
  const history = new Map([
    ['198.51.100.x', { firstSeen: d('01') }],
    ['203.0.113.x', { firstSeen: d('10') }],
  ]);

  it('flags the first event from a new network when older networks exist', () => {
    expect(isUnrecognised(d('10'), '203.0.113.x', history)).toBe(true);
  });

  it('does not flag later events on a network already seen', () => {
    expect(isUnrecognised(d('11'), '203.0.113.x', history)).toBe(false);
  });

  it('does not flag an account’s very first network', () => {
    expect(isUnrecognised(d('01'), '198.51.100.x', history)).toBe(false);
  });
});
