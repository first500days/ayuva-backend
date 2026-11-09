import {
  BULK_DOWNLOADS,
  FAILED_SIGNINS,
  type FlaggableRow,
  findFlags,
  networkOf,
} from './security-flags';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

let n = 0;
const row = (
  action: string,
  at: string,
  extra: Partial<FlaggableRow> = {},
): FlaggableRow => ({
  id: `r${++n}`,
  at,
  action,
  actorUserId: 'u1',
  actorName: 'Asha',
  ip: null,
  ...extra,
});

const downloads = (count: number, spacingMins = 1, startMins = 100) =>
  Array.from({ length: count }, (_, i) =>
    row('record_downloaded', minsAgo(startMins - i * spacingMins)),
  );

describe('bulk downloads', () => {
  it('flags a burst within an hour, once, naming the count', () => {
    const flags = findFlags(downloads(BULK_DOWNLOADS), NOW);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: 'bulk_download' });
    expect(flags[0].message).toContain(`${BULK_DOWNLOADS} patient records`);
    expect(flags[0].rowIds).toHaveLength(BULK_DOWNLOADS);
  });

  it('leaves ordinary use alone', () => {
    expect(findFlags(downloads(BULK_DOWNLOADS - 1), NOW)).toEqual([]);
  });

  it('does not count the same downloads spread across a day', () => {
    expect(findFlags(downloads(30, 30, 1000), NOW)).toEqual([]);
  });

  it('merges a long burst into one flag', () => {
    const flags = findFlags(downloads(60, 1, 90), NOW);
    expect(flags).toHaveLength(1);
    expect(flags[0].rowIds).toHaveLength(60);
  });

  it('counts each person separately', () => {
    const a = downloads(BULK_DOWNLOADS - 5);
    const b = downloads(BULK_DOWNLOADS - 5).map((r) => ({
      ...r,
      actorUserId: 'u2',
    }));
    expect(findFlags([...a, ...b], NOW)).toEqual([]);
  });

  it('points the freeze action at the latest row', () => {
    const rows = downloads(BULK_DOWNLOADS);
    expect(findFlags(rows, NOW)[0].row.id).toBe(rows[rows.length - 1].id);
  });
});

describe('failed sign-ins', () => {
  const fails = (count: number, spacing = 1) =>
    Array.from({ length: count }, (_, i) =>
      row('login_failed', minsAgo(60 - i * spacing)),
    );

  it('flags repeated failures close together', () => {
    expect(findFlags(fails(FAILED_SIGNINS), NOW)[0].kind).toBe(
      'failed_signins',
    );
  });

  it('ignores the odd mistyped password', () => {
    expect(findFlags(fails(FAILED_SIGNINS - 1), NOW)).toEqual([]);
    expect(findFlags(fails(FAILED_SIGNINS, 20), NOW)).toEqual([]);
  });
});

describe('sign-ins from a new network', () => {
  const login = (ip: string, mins: number) =>
    row('login', minsAgo(mins), { ip });
  const history = [
    login('49.36.10.5', 5000),
    login('49.36.10.77', 4000),
    login('49.36.10.9', 3000),
  ];

  it('flags an address outside the usual network', () => {
    const [flag] = findFlags([...history, login('185.220.101.4', 30)], NOW);
    expect(flag).toMatchObject({ kind: 'new_ip' });
    expect(flag.message).toContain('185.220.101.4');
  });

  it('allows movement within the same provider range', () => {
    expect(findFlags([...history, login('49.36.10.200', 30)], NOW)).toEqual([]);
  });

  it('flags a new network only the first time', () => {
    const flags = findFlags(
      [...history, login('185.220.101.4', 60), login('185.220.101.8', 30)],
      NOW,
    );
    expect(flags).toHaveLength(1);
  });

  it('needs some history first, so a new starter is not flagged', () => {
    expect(
      findFlags([login('49.36.10.5', 500), login('185.220.101.4', 30)], NOW),
    ).toEqual([]);
  });

  it('skips rows with no recorded address', () => {
    expect(
      findFlags([...history, row('login', minsAgo(30), { ip: null })], NOW),
    ).toEqual([]);
  });
});

describe('flag age and order', () => {
  it('drops flags older than a week', () => {
    const old = Array.from({ length: BULK_DOWNLOADS }, () =>
      row('record_downloaded', minsAgo(8 * 24 * 60)),
    );
    expect(findFlags(old, NOW)).toEqual([]);
  });

  it('puts the newest first', () => {
    const fails = Array.from({ length: FAILED_SIGNINS }, () =>
      row('login_failed', minsAgo(2000)),
    );
    const flags = findFlags([...fails, ...downloads(BULK_DOWNLOADS)], NOW);
    expect(flags.map((f) => f.kind)).toEqual([
      'bulk_download',
      'failed_signins',
    ]);
  });

  it('ignores rows with no person attached', () => {
    const rows = downloads(BULK_DOWNLOADS).map((r) => ({
      ...r,
      actorUserId: null,
    }));
    expect(findFlags(rows, NOW)).toEqual([]);
  });
});

describe('networkOf', () => {
  it('uses the first three parts of an address', () => {
    expect(networkOf('49.36.10.5')).toBe('49.36.10');
    expect(networkOf('::ffff:49.36.10.5')).toBe('49.36.10');
    expect(networkOf('2405:201:6000:1::2')).toBe('2405:201:6000');
  });
});
