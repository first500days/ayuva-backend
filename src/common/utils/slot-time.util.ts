/**
 * Slot times ("09:30") are wall-clock times in the providers' local zone, with
 * `date` stored as that calendar day at 00:00 UTC. Set SLOT_TIMEZONE (IANA name)
 * if providers are not in India.
 */
const slotTimeZone = (): string => process.env.SLOT_TIMEZONE ?? 'Asia/Kolkata';

/** True when the slot's start time is earlier than `now` in the slot time zone. */
export function isSlotInPast(slotDate: Date, time: string, now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: slotTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  const nowTime = `${get('hour')}:${get('minute')}`;
  const day = slotDate.toISOString().slice(0, 10);
  return day < today || (day === today && time < nowTime);
}
