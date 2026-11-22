import { clientIp, isLocalIp, normaliseIp, isLoopbackIp, displayIp } from './client-ip';

describe('clientIp', () => {
  it('unwraps IPv4-mapped IPv6 and ports', () => {
    expect(normaliseIp('::ffff:49.37.10.2')).toBe('49.37.10.2');
    expect(normaliseIp('49.37.10.2:5123')).toBe('49.37.10.2');
  });
  it('treats loopback and private ranges as local', () => {
    for (const ip of ['::1', '127.0.0.1', '10.0.3.4', '192.168.1.9', '172.20.0.1'])
      expect(isLocalIp(ip)).toBe(true);
    expect(isLocalIp('49.37.10.2')).toBe(false);
  });
  it('keeps a public req.ip', () => {
    expect(clientIp({ ip: '49.37.10.2', headers: {} })).toBe('49.37.10.2');
  });
  it('falls back to the first public x-forwarded-for entry', () => {
    expect(
      clientIp({
        ip: '10.0.0.5',
        headers: { 'x-forwarded-for': '10.0.0.9, 103.21.244.12, 10.0.0.5' },
      }),
    ).toBe('103.21.244.12');
  });
  it('returns the loopback when nothing better exists', () => {
    expect(clientIp({ ip: '::1', headers: {} })).toBe('::1');
  });
});

describe('loopback addresses are never shown or stored as the caller', () => {
  it('recognises 127.x, ::1 and ::', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp('127.0.1.1')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    expect(isLoopbackIp('::')).toBe(true);
    expect(isLoopbackIp('49.36.10.2')).toBe(false);
    expect(isLoopbackIp('10.0.0.4')).toBe(false);
  });

  it('displays nothing for a loopback string, the address otherwise', () => {
    expect(displayIp('::ffff:127.0.0.1')).toBeUndefined();
    expect(displayIp('::1')).toBeUndefined();
    expect(displayIp('::ffff:49.36.10.2')).toBe('49.36.10.2');
    expect(displayIp(undefined)).toBeUndefined();
  });
});
