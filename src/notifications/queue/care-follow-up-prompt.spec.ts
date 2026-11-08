import { careFollowUpPromptAt } from './reminder-queue.service';

// 9 am in Asia/Kolkata (the default slot zone) is 03:30 UTC.
describe('careFollowUpPromptAt', () => {
  const followUp = new Date('2026-11-20T00:00:00Z');

  it('prompts at 9 am the day before', () => {
    expect(careFollowUpPromptAt(followUp, new Date('2026-11-10T00:00:00Z'))?.toISOString()).toBe(
      '2026-11-19T03:30:00.000Z',
    );
  });

  it('prompts at 9 am on the day when the day before has gone', () => {
    expect(careFollowUpPromptAt(followUp, new Date('2026-11-19T10:00:00Z'))?.toISOString()).toBe(
      '2026-11-20T03:30:00.000Z',
    );
  });

  it('does not prompt once 9 am on the day has passed', () => {
    expect(careFollowUpPromptAt(followUp, new Date('2026-11-20T04:00:00Z'))).toBeNull();
  });
});
