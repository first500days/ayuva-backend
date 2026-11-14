import { courseDays, durationDays, refillPromptAt } from './rx-course';

describe('rx course', () => {
  it('reads durations in days, weeks and months', () => {
    expect(durationDays('5 days')).toBe(5);
    expect(durationDays('x 2 weeks')).toBe(14);
    expect(durationDays('1 month')).toBe(30);
    expect(durationDays('10d')).toBe(10);
    expect(durationDays('Continue')).toBeNull();
    expect(durationDays('SOS')).toBeNull();
  });

  it('takes the longest line as the course', () => {
    expect(
      courseDays([
        { duration: '5 days' },
        { duration: '3 weeks' },
        { duration: 'as needed' },
      ]),
    ).toBe(21);
    expect(courseDays([{ duration: 'continue' }])).toBeNull();
  });

  it('prompts at 85% of the course, and not for very short or open-ended ones', () => {
    const signed = new Date('2026-11-01T00:00:00Z');
    expect(
      refillPromptAt(signed, [{ duration: '20 days' }])!.toISOString(),
    ).toBe('2026-11-18T00:00:00.000Z');
    expect(refillPromptAt(signed, [{ duration: '2 days' }])).toBeNull();
    expect(refillPromptAt(signed, [{ duration: 'continue' }])).toBeNull();
  });
});
