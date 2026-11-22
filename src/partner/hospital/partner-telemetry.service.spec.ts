import { cleanFrame, currentObservations } from './partner-telemetry.service';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const minsAgo = (m: number) => new Date(NOW - m * 60_000);

describe('cleanFrame', () => {
  it('keeps believable readings', () => {
    expect(cleanFrame({ hr: 72, spo2: 97, rr: 16 })).toMatchObject({
      hr: 72,
      spo2: 97,
      rr: 16,
    });
  });

  it('drops impossible or malformed readings', () => {
    const f = cleanFrame({ hr: 900, spo2: -1, rr: '16' });
    expect(f.hr).toBeUndefined();
    expect(f.spo2).toBeUndefined();
    expect(f.rr).toBeUndefined();
  });

  it('needs a sample rate to accept a waveform, and the reverse', () => {
    expect(cleanFrame({ ecg: [1, 2, 3] }).ecg).toBeUndefined();
    expect(cleanFrame({ fs: 250 }).fs).toBeUndefined();
    expect(cleanFrame({ ecg: [1, 2, 3], fs: 250 })).toMatchObject({
      ecg: [1, 2, 3],
      fs: 250,
    });
  });

  it('refuses a waveform with bad samples or too many of them', () => {
    expect(cleanFrame({ ecg: [1, 'x'], fs: 250 }).ecg).toBeUndefined();
    expect(
      cleanFrame({ ecg: new Array(2001).fill(0), fs: 250 }).ecg,
    ).toBeUndefined();
  });
});

describe('currentObservations', () => {
  it('takes the newest value of each measurement across rows', () => {
    const obs = currentObservations(
      [
        { at: minsAgo(1), source: 'monitor', hr: 110, spo2: 95 },
        { at: minsAgo(30), source: 'manual', tempC: 38.4, hr: 90 },
      ],
      NOW,
    );
    expect(obs).toMatchObject({ hr: 110, spo2: 95, tempC: 38.4 });
  });

  it('forgets a monitor that went quiet', () => {
    const obs = currentObservations(
      [{ at: minsAgo(16), source: 'monitor', hr: 120 }],
      NOW,
    );
    expect(obs.hr).toBeUndefined();
  });

  it('keeps a charted observation for a nursing round, then forgets it', () => {
    const rows = [{ at: minsAgo(7 * 60), source: 'manual', systolic: 118 }];
    expect(currentObservations(rows, NOW).systolic).toBe(118);
    const old = [{ at: minsAgo(9 * 60), source: 'manual', systolic: 118 }];
    expect(currentObservations(old, NOW).systolic).toBeUndefined();
  });

  it('treats zero and false as real readings', () => {
    const obs = currentObservations(
      [{ at: minsAgo(1), source: 'manual', hr: 0, onOxygen: false }],
      NOW,
    );
    expect(obs.hr).toBe(0);
    expect(obs.onOxygen).toBe(false);
  });
});
