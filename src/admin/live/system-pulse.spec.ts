import { apiStatus, buildPulse, type Measurements } from './system-pulse';

const base: Measurements = {
  api: {
    perMinute: 120,
    p95Ms: 80,
    errorRate: 0,
    loopLagMs: 5,
    heapMb: 120,
    uptimeS: 600,
  },
  mongo: { up: true, pingMs: 4 },
  redis: { up: true, pingMs: 1 },
  sockets: { partner: 3, admin: 1 },
  ai: { last5m: 10, avgMs: 40, flagged: 0 },
  channels: { push: true, whatsapp: false, sms: true },
};

describe('system pulse', () => {
  it('marks the API degraded on errors or a stalled event loop', () => {
    expect(apiStatus(base.api)).toBe('operational');
    expect(apiStatus({ ...base.api, errorRate: 0.06 })).toBe('degraded');
    expect(apiStatus({ ...base.api, loopLagMs: 350 })).toBe('degraded');
    expect(apiStatus({ ...base.api, errorRate: 0.3 })).toBe('down');
  });

  it('turns a failed database ping into a red edge from the API', () => {
    const { nodes, edges } = buildPulse({
      ...base,
      mongo: { up: false, pingMs: null },
    });
    expect(nodes.find((n) => n.key === 'mongo')!.status).toBe('down');
    expect(edges.find((e) => e.to === 'mongo')!.status).toBe('down');
  });

  it('shows an unconfigured channel as log-only, not as down', () => {
    const { nodes } = buildPulse(base);
    const wa = nodes.find((n) => n.key === 'whatsapp')!;
    expect(wa.status).toBe('not_configured');
    expect(wa.headline).toBe('Log-only');
  });
});

describe('first frame', () => {
  it('says "Checking" rather than down before the first ping returns', () => {
    const { nodes } = buildPulse({
      ...base,
      mongo: { up: null, pingMs: null },
    });
    const mongo = nodes.find((n) => n.key === 'mongo')!;
    expect(mongo.status).toBe('idle');
    expect(mongo.headline).toBe('Checking…');
  });
});
