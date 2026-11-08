import { buildJourneyMap, type JourneyMapInput } from './journey-map';
import { CareStepStatus } from './schemas/care-journey.schema';

const now = new Date('2026-11-08T06:00:00Z');
const d = (iso: string) => new Date(iso);

const base = (over: Partial<JourneyMapInput> = {}): JourneyMapInput => ({
  now,
  journey: null,
  appointments: [],
  prescriptions: [],
  records: [],
  ...over,
});

const pathway = {
  id: 'j1',
  createdAt: d('2026-11-01T00:00:00Z'),
  steps: [
    { name: 'Book a visit', status: CareStepStatus.CURRENT, trigger: 'booked' as const, route: '/(tabs)/explore', params: { specialty: 'GP' } },
    { name: 'Attend your visit', status: CareStepStatus.UPCOMING, trigger: 'visited' as const, contextNote: 'Bring your medicines.' },
    { name: 'Keep your documents', status: CareStepStatus.UPCOMING, trigger: 'document' as const },
    { name: 'Follow-up', status: CareStepStatus.UPCOMING, trigger: 'followup' as const },
  ],
};

const booking = {
  id: 'a1',
  providerName: 'Dr Rao',
  at: d('2026-11-12T05:00:00Z'),
  createdAt: d('2026-11-02T00:00:00Z'),
  completed: false,
  isFollowUp: false,
};

describe('buildJourneyMap', () => {
  it('is empty when nothing has happened', () => {
    expect(buildJourneyMap(base())).toEqual({ milestones: [], steps: [], progressPct: 0 });
  });

  it('starts a new pathway on its first step, with no invented dates', () => {
    const map = buildJourneyMap(base({ journey: pathway }));
    expect(map.milestones.map((m) => m.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
    expect(map.milestones.every((m) => m.at === undefined)).toBe(true);
    expect(map.milestones[0].route).toBe('/(tabs)/explore');
    expect(map.steps[0].status).toBe(CareStepStatus.CURRENT);
    expect(map.progressPct).toBe(0);
  });

  it('completes the booking step from a real booking and dates the visit', () => {
    const map = buildJourneyMap(base({ journey: pathway, appointments: [booking] }));
    expect(map.milestones[0]).toMatchObject({ title: 'Book a visit', state: 'done', detail: 'Booked with Dr Rao' });
    expect(map.milestones[1]).toMatchObject({ title: 'Attend your visit', state: 'current', at: booking.at.toISOString() });
    expect(map.progressPct).toBe(25);
  });

  it('shows a booking used by a step only once', () => {
    const map = buildJourneyMap(base({ journey: pathway, appointments: [booking] }));
    expect(map.milestones.filter((m) => m.kind === 'appointment')).toHaveLength(0);
  });

  it('ignores what happened before the pathway began', () => {
    const old = { ...booking, createdAt: d('2026-10-01T00:00:00Z'), at: d('2026-10-05T05:00:00Z') };
    const map = buildJourneyMap(base({ journey: pathway, appointments: [old] }));
    expect(map.steps[0].status).toBe(CareStepStatus.CURRENT);
    expect(map.milestones.find((m) => m.kind === 'appointment')?.state).toBe('done');
  });

  it('does not count a booked visit as attended until the provider confirms it', () => {
    const past = { ...booking, at: d('2026-11-05T05:00:00Z') };
    const map = buildJourneyMap(base({ journey: pathway, appointments: [past] }));
    expect(map.steps[1].status).toBe(CareStepStatus.CURRENT);
  });

  it('treats earlier steps as done once a later one has happened', () => {
    const record = { id: 'r1', type: 'lab_report', providerName: 'Lab', fromProvider: true, date: d('2026-11-03T00:00:00Z'), uploadedAt: d('2026-11-03T00:00:00Z') };
    const map = buildJourneyMap(base({ journey: pathway, records: [record] }));
    expect(map.steps.map((s) => s.status)).toEqual([
      CareStepStatus.DONE,
      CareStepStatus.DONE,
      CareStepStatus.DONE,
      CareStepStatus.CURRENT,
    ]);
    expect(map.milestones.filter((m) => m.kind === 'lab_report')).toHaveLength(0);
  });

  it('dates the follow-up step from the doctor’s prescription', () => {
    const rx = { id: 'p1', doctorName: 'Dr Rao', signedAt: d('2026-11-03T00:00:00Z'), followUpDate: d('2026-11-20T00:00:00Z') };
    const map = buildJourneyMap(base({ journey: pathway, prescriptions: [rx] }));
    expect(map.milestones.find((m) => m.title === 'Follow-up')).toMatchObject({ at: rx.followUpDate.toISOString(), allDay: true });
    expect(map.milestones.filter((m) => m.kind === 'follow_up')).toHaveLength(0);
  });

  it('keeps the stored status of pathways from before triggers', () => {
    const legacy = {
      id: 'j2',
      createdAt: d('2026-11-01T00:00:00Z'),
      steps: [
        { name: 'One', status: CareStepStatus.DONE },
        { name: 'Two', status: CareStepStatus.CURRENT },
      ],
    };
    const map = buildJourneyMap(base({ journey: legacy, appointments: [booking] }));
    expect(map.steps.map((s) => s.status)).toEqual([CareStepStatus.DONE, CareStepStatus.CURRENT]);
    expect(map.progressPct).toBe(50);
  });

  describe('without a pathway', () => {
    const rx = { id: 'p1', doctorName: 'Dr Rao', signedAt: d('2026-11-03T00:00:00Z') };

    it('makes the soonest open item current and orders history first', () => {
      const report = { id: 'r1', type: 'lab_report', fromProvider: false, date: d('2026-10-01T00:00:00Z'), uploadedAt: d('2026-10-01T00:00:00Z') };
      const later = { ...booking, id: 'a2', at: d('2026-12-01T05:00:00Z') };
      const map = buildJourneyMap(base({ appointments: [later, booking], records: [report] }));
      expect(map.milestones.map((m) => m.id)).toEqual(['rec:r1', 'appt:a1', 'appt:a2']);
      expect(map.milestones.map((m) => m.state)).toEqual(['done', 'current', 'upcoming']);
      expect(map.milestones[0].detail).toBe('Added by you');
    });

    it('never uses a file name as the title', () => {
      const photo = { id: 'r2', type: 'scan', fromProvider: false, date: now, uploadedAt: now };
      expect(buildJourneyMap(base({ records: [photo] })).milestones[0].title).toBe('Scan');
    });

    it('leaves out documents that are not care events', () => {
      const insurance = { id: 'r3', type: 'insurance', fromProvider: false, date: now, uploadedAt: now };
      expect(buildJourneyMap(base({ records: [insurance] })).milestones).toHaveLength(0);
    });

    it('adds the doctor’s follow-up date as a milestone', () => {
      const map = buildJourneyMap(base({ prescriptions: [{ ...rx, followUpDate: d('2026-11-20T00:00:00Z') }] }));
      expect(map.milestones[0]).toMatchObject({ kind: 'follow_up', title: 'Follow-up with Dr Rao', state: 'current', allDay: true });
    });

    it('drops the follow-up once a visit is booked near that date', () => {
      const near = { ...booking, at: d('2026-11-21T05:00:00Z'), createdAt: d('2026-11-04T00:00:00Z') };
      const map = buildJourneyMap(base({ appointments: [near], prescriptions: [{ ...rx, followUpDate: d('2026-11-20T00:00:00Z') }] }));
      expect(map.milestones.map((m) => m.kind)).toEqual(['appointment']);
    });

    it('says so when a follow-up date has passed, then stops after a month', () => {
      const recent = buildJourneyMap(base({ prescriptions: [{ ...rx, followUpDate: d('2026-11-01T00:00:00Z') }] }));
      expect(recent.milestones[0].detail).toContain('has passed');
      const stale = buildJourneyMap(base({ prescriptions: [{ ...rx, followUpDate: d('2026-09-01T00:00:00Z') }] }));
      expect(stale.milestones).toHaveLength(0);
    });

    it('keeps only recent history', () => {
      const records = Array.from({ length: 45 }, (_, i) => {
        const at = new Date(now.getTime() - (i + 1) * 86_400_000);
        return { id: `r${i}`, type: 'lab_report', fromProvider: false, date: at, uploadedAt: at };
      });
      const { milestones } = buildJourneyMap(base({ records }));
      expect(milestones).toHaveLength(30);
      expect(milestones[29].id).toBe('rec:r0');
    });
  });
});
