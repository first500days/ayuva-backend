import { BadRequestException } from '@nestjs/common';
import { recentPast } from './recent-past';

describe('recentPast', () => {
  const now = Date.parse('2026-11-13T12:00:00Z');

  it('means "now" when no time is given', () => {
    expect(recentPast(undefined, 12, now)).toBeUndefined();
    expect(recentPast('', 12, now)).toBeUndefined();
  });

  it('keeps an offline entry made within the window', () => {
    expect(recentPast('2026-11-13T09:30:00Z', 12, now)?.toISOString()).toBe(
      '2026-11-13T09:30:00.000Z',
    );
  });

  it('refuses entries that are too old, in the future or unreadable', () => {
    expect(() => recentPast('2026-11-12T20:00:00Z', 12, now)).toThrow(
      BadRequestException,
    );
    expect(() => recentPast('2026-11-13T12:30:00Z', 12, now)).toThrow(
      BadRequestException,
    );
    expect(() => recentPast('not a date', 12, now)).toThrow(
      BadRequestException,
    );
  });
});
