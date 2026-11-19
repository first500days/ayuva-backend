import {
  isOriginAllowed,
  originGuardMiddleware,
  parseAllowedOrigins,
} from './allowed-origins';

const allowed = parseAllowedOrigins(
  'https://ayuvaxai.com, https://Admin.ayuvaxai.com/ ,',
);

function run(path: string, headers: Record<string, string>) {
  const res = { code: 0, status: jest.fn(), json: jest.fn() };
  res.status.mockImplementation((c: number) => {
    res.code = c;
    return res;
  });
  const next = jest.fn();
  originGuardMiddleware(allowed)(
    { path, headers } as never,
    res as never,
    next,
  );
  return { res, next };
}

describe('allowed origins', () => {
  it('parses, lowercases and strips trailing slashes', () => {
    expect(allowed).toEqual([
      'https://ayuvaxai.com',
      'https://admin.ayuvaxai.com',
    ]);
  });

  it('matches exactly', () => {
    expect(isOriginAllowed('https://ayuvaxai.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://ayuvaxai.com.evil.io', allowed)).toBe(
      false,
    );
    expect(isOriginAllowed('http://ayuvaxai.com', allowed)).toBe(false);
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
  });

  it('blocks unknown origins before the controller', () => {
    const { res, next } = run('/api/v1/x', { origin: 'https://evil.example' });
    expect(res.code).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows our frontends', () => {
    expect(
      run('/api/v1/x', { origin: 'https://ayuvaxai.com' }).next,
    ).toHaveBeenCalled();
  });

  it('allows requests with no Origin (mobile app)', () => {
    expect(run('/api/v1/x', {}).next).toHaveBeenCalled();
  });

  it('blocks cross-site browser requests without Origin', () => {
    expect(run('/api/v1/x', { 'sec-fetch-site': 'cross-site' }).res.code).toBe(
      403,
    );
  });

  it('exempts health and scan-view', () => {
    expect(run('/health', { origin: 'https://x.io' }).next).toHaveBeenCalled();
    expect(
      run('/api/v1/scan-view', { origin: 'https://viewer.ayuva.local' }).next,
    ).toHaveBeenCalled();
  });
});
