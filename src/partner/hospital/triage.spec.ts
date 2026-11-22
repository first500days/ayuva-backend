import { median, minutesOverTarget, suggestLevel } from './triage';

describe('triage suggestion', () => {
  it('calls for resuscitation on life-threatening vitals', () => {
    expect(suggestLevel({ gcs: 7, hr: 120 })).toEqual({
      level: 1,
      reasons: ['GCS 7 (≤ 8)'],
    });
    expect(suggestLevel({ spo2: 80 }).level).toBe(1);
    expect(suggestLevel({ sbp: 70 }).level).toBe(1);
    expect(suggestLevel({}, { unresponsive: true }).level).toBe(1);
  });

  it('takes the most urgent level and lists every reason at it', () => {
    const s = suggestLevel({ spo2: 89, hr: 135, temp: 38.9, pain: 3 });
    expect(s.level).toBe(2);
    expect(s.reasons).toEqual(['SpO₂ 89% (< 92)', 'Heart rate 135']);
  });

  it('suggests urgent and less urgent levels', () => {
    expect(suggestLevel({ temp: 39.1 }).level).toBe(3);
    expect(suggestLevel({ hr: 104 }).level).toBe(4);
  });

  it('suggests nothing when vitals are normal or missing', () => {
    expect(
      suggestLevel({
        hr: 80,
        sbp: 124,
        rr: 16,
        spo2: 98,
        temp: 36.8,
        gcs: 15,
        pain: 0,
      }),
    ).toEqual({
      level: null,
      reasons: [],
    });
    expect(suggestLevel({}).level).toBeNull();
  });

  it('measures waits against the level target', () => {
    const at = new Date('2026-11-04T10:00:00');
    expect(minutesOverTarget(2, at, new Date('2026-11-04T10:08:00'))).toBe(-2);
    expect(minutesOverTarget(2, at, new Date('2026-11-04T10:25:00'))).toBe(15);
    expect(minutesOverTarget(1, at, new Date('2026-11-04T10:01:00'))).toBe(1);
  });

  it('takes medians', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 10])).toBe(4);
    expect(median([])).toBeNull();
  });
});
