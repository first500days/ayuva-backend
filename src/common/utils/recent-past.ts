import { BadRequestException } from '@nestjs/common';

const FUTURE_SLACK_MS = 5 * 60 * 1000;

/**
 * The time an entry was really made, for entries a portal saved on the device
 * while offline and sent later. Nothing given means "now" (undefined). A time
 * further back than `maxHours`, or ahead of the server clock, is refused: it
 * must be charted by hand with a note rather than slipped in silently.
 */
export function recentPast(
  iso: string | null | undefined,
  maxHours = 12,
  now = Date.now(),
): Date | undefined {
  if (!iso) return undefined;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()))
    throw new BadRequestException('That entry has an invalid time');
  if (at.getTime() > now + FUTURE_SLACK_MS)
    throw new BadRequestException(
      'That entry is timed in the future — check the device clock',
    );
  if (now - at.getTime() > maxHours * 60 * 60 * 1000)
    throw new BadRequestException(
      `That entry was made more than ${maxHours} hours ago — enter it by hand with a note`,
    );
  return at;
}
