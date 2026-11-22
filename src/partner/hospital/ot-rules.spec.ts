import {
  missingFor,
  onRoster,
  overlaps,
  rosterFor,
  timeGate,
} from './ot-rules';

// Wall-clock times in India on Wednesday 4 Nov 2026.
const t = (hhmm: string) => new Date(`2026-11-04T${hhmm}:00+05:30`);

describe('OT rules', () => {
  it('detects clashing bookings', () => {
    expect(
      overlaps(
        { start: t('09:00'), end: t('11:00') },
        { start: t('10:30'), end: t('12:00') },
      ),
    ).toBe(true);
    expect(
      overlaps(
        { start: t('09:00'), end: t('11:00') },
        { start: t('11:00'), end: t('12:00') },
      ),
    ).toBe(false);
  });

  const base = {
    side: 'left',
    anaesthesia: 'general',
    preOp: {},
    safety: {},
    postOp: null,
  };

  it('holds a case at pre-op until consent, site marking, anaesthesia check and fasting are done', () => {
    expect(missingFor('pre_op', 'in_theatre', base)).toEqual([
      'Consent signed',
      'Operative site marked',
      'Pre-anaesthesia check',
      'Fasting (NPO) confirmed',
    ]);
    const ready = {
      ...base,
      preOp: { consent: 1, siteMarked: 1, anaesthesiaCheck: 1, fasting: 1 },
    };
    expect(missingFor('pre_op', 'in_theatre', ready)).toEqual([]);
  });

  it('needs less for a local-anaesthesia case without laterality', () => {
    const local = {
      ...base,
      side: 'na',
      anaesthesia: 'local',
      preOp: { consent: 1 },
    };
    expect(missingFor('pre_op', 'in_theatre', local)).toEqual([]);
  });

  it('requires the WHO checklist to leave theatre, and an operation note to complete', () => {
    expect(
      missingFor('in_theatre', 'recovery', { ...base, safety: { signIn: 1 } }),
    ).toEqual([
      'WHO Time Out (before incision)',
      'WHO Sign Out (before leaving theatre)',
    ]);
    expect(
      missingFor('recovery', 'completed', {
        ...base,
        postOp: { procedureDone: 'TKR' },
      }),
    ).toEqual(['Operation note: where the patient goes next']);
  });

  it('lets only local cases skip recovery', () => {
    const done = {
      safety: { signIn: 1, timeOut: 1, signOut: 1 },
      postOp: { procedureDone: 'x', disposition: 'home' },
    };
    expect(
      missingFor('in_theatre', 'completed', {
        ...base,
        ...done,
        anaesthesia: 'local',
      }),
    ).toEqual([]);
    expect(missingFor('in_theatre', 'completed', { ...base, ...done })).toEqual(
      ['Recovery — only local-anaesthesia cases skip the recovery bay'],
    );
  });

  it('refuses stage jumps', () => {
    expect(missingFor('scheduled', 'completed', base)[0]).toMatch(/can't go/);
    expect(missingFor('completed', 'pre_op', base)[0]).toMatch(/can't go/);
  });

  it('gates recorded times on the checklist', () => {
    expect(timeGate('anaesthesiaStart', {})).toMatch(/Sign In/);
    expect(timeGate('incision', { signIn: 1 })).toMatch(/Time Out/);
    expect(timeGate('incision', { signIn: 1, timeOut: 1 })).toBeNull();
    expect(timeGate('wheeledOut', { signIn: 1, timeOut: 1 })).toMatch(
      /Sign Out/,
    );
    expect(timeGate('closure', {})).toBeNull();
  });

  it('reads the duty roster for the day', () => {
    const roster = [
      { day: 'wed', start: '08:00', end: '14:00' },
      { day: 'thu', start: '14:00', end: '20:00' },
    ];
    expect(rosterFor(roster, t('10:00'), 'Asia/Kolkata')).toEqual([
      { start: 480, end: 840 },
    ]);
    expect(onRoster(roster, t('09:00'), t('12:00'), 'Asia/Kolkata')).toBe(true);
    expect(onRoster(roster, t('13:00'), t('15:00'), 'Asia/Kolkata')).toBe(
      false,
    );
    expect(onRoster([], t('13:00'), t('15:00'), 'Asia/Kolkata')).toBe(true);
  });
});
