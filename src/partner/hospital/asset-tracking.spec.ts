import { normaliseTag, takesOver } from './asset-tracking';

const t0 = new Date('2026-11-13T10:00:00Z');
const at = (s: number) => new Date(t0.getTime() + s * 1000);

describe('asset tracking rules', () => {
  it('normalises tags and ignores junk', () => {
    expect(normaliseTag(' ac:23:3f:a1:02:9b ')).toBe('AC:23:3F:A1:02:9B');
    expect(normaliseTag('E2801160600002')).toBe('E2801160600002');
    expect(normaliseTag('x')).toBeNull();
    expect(normaliseTag('bad tag!')).toBeNull();
    expect(normaliseTag(42)).toBeNull();
  });

  it('places an untracked machine at the first reading', () => {
    expect(takesOver(undefined, { at: t0, zone: 'ICU', gatewayId: 'g1' })).toBe(
      true,
    );
  });

  it('prefers the stronger signal while both readings are fresh', () => {
    const prev = { at: t0, zone: 'ICU bay 1', gatewayId: 'g1', rssi: -60 };
    expect(
      takesOver(prev, {
        at: at(5),
        zone: 'ICU bay 2',
        gatewayId: 'g2',
        rssi: -75,
      }),
    ).toBe(false);
    expect(
      takesOver(prev, {
        at: at(5),
        zone: 'ICU bay 2',
        gatewayId: 'g2',
        rssi: -50,
      }),
    ).toBe(true);
  });

  it('lets a weaker reading win once the stronger one has gone quiet', () => {
    const prev = { at: t0, zone: 'ICU bay 1', gatewayId: 'g1', rssi: -55 };
    expect(
      takesOver(prev, {
        at: at(20),
        zone: 'Corridor',
        gatewayId: 'g2',
        rssi: -85,
      }),
    ).toBe(true);
  });

  it('refreshes from the same gateway and never moves back on late readings', () => {
    const prev = { at: at(30), zone: 'OT 2', gatewayId: 'g3', rssi: -70 };
    expect(
      takesOver(prev, { at: at(31), zone: 'OT 2', gatewayId: 'g3', rssi: -90 }),
    ).toBe(true);
    expect(
      takesOver(prev, {
        at: at(10),
        zone: 'Store',
        gatewayId: 'g4',
        rssi: -40,
      }),
    ).toBe(false);
  });
});
