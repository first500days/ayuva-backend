import {
  documentTasks,
  fastingHours,
  fastingWindow,
  USUAL_FASTING_HOURS,
} from './prep-guidelines';

describe('prep guidelines', () => {
  it('reads fasting hours from the lab’s instructions', () => {
    expect(fastingHours('Overnight fasting of 10-12 hours required')).toBe(12);
    expect(fastingHours('8 hrs fasting; water allowed')).toBe(8);
    expect(fastingHours('No special preparation')).toBeNull();
  });

  it('counts down from the longest window the booked tests ask for', () => {
    const at = new Date('2026-11-20T03:30:00Z');
    const w = fastingWindow(at, [
      {
        name: 'Lipid Profile',
        fastingRequired: true,
        preparation: 'Fast for 12 hours. Water is fine.',
      },
      {
        name: 'Fasting Blood Sugar',
        fastingRequired: true,
        preparation: '8-10 hours fasting',
      },
      { name: 'CBC', fastingRequired: false },
    ]);
    expect(w).toMatchObject({
      hours: 12,
      hoursFrom: 'lab',
      tests: ['Lipid Profile', 'Fasting Blood Sugar'],
    });
    expect(w!.startsAt).toBe('2026-11-19T15:30:00.000Z');
    expect(w!.title).toBe('Fasting for 2 tests');
  });

  it('uses the usual minimum and says so when the lab gives no hours', () => {
    const w = fastingWindow(new Date('2026-11-20T03:30:00Z'), [
      { name: 'Glucose', fastingRequired: true },
    ]);
    expect(w!.hours).toBe(USUAL_FASTING_HOURS);
    expect(w!.hoursFrom).toBe('usual');
    expect(w!.detail).toContain('please confirm with the lab');
  });

  it('has no countdown when nothing needs fasting', () => {
    expect(
      fastingWindow(new Date(), [{ name: 'CBC', fastingRequired: false }]),
    ).toBeNull();
  });

  it('ticks documents the patient has prepared', () => {
    const t = documentTasks({
      questionsChosen: 2,
      recordsAttached: 0,
      medicinesListed: 3,
      symptomsNoted: false,
    });
    expect(t.filter((x) => x.done).map((x) => x.id)).toEqual([
      'questions',
      'medicines',
    ]);
  });
});
