/**
 * The cascade for alerts that would otherwise only sit in the app's list:
 * push first; if the alert is still unread 3 minutes later (or the person has
 * no app to push to), a WhatsApp message; if still unread 3 minutes after
 * that, an SMS. Messages outside the app say only that something is waiting:
 * no names, no clinical detail. Each channel follows the person's settings.
 */

export const CASCADE_STEP_MS = 3 * 60_000;

/** Alerts that cascade. Report-ready alerts are left out: they have their own push and WhatsApp. */
export const CASCADE_TRIGGERS = new Set([
  'prescription_available',
  'prescription_cancelled',
  'booking_confirmed',
  'booking_changed',
  'test_booking_confirmed',
  'report_summary_released',
]);

export const OUTSIDE_APP_TEXT =
  'AYUVA: you have an update waiting in the app. Open AYUVA to see it.';

export interface CascadeState {
  createdAt: Date;
  read: boolean;
  pushDevices?: number | null;
  whatsappAt?: Date | null;
  smsAt?: Date | null;
}

export type CascadeStep = 'whatsapp' | 'sms' | null;

/** The next channel this alert is due on, if any. */
export function nextStep(s: CascadeState, now: Date): CascadeStep {
  if (s.read) return null;
  const age = now.getTime() - s.createdAt.getTime();
  const noApp = s.pushDevices === 0;
  if (!s.whatsappAt) return noApp || age >= CASCADE_STEP_MS ? 'whatsapp' : null;
  if (!s.smsAt) {
    const sinceWhatsApp = now.getTime() - s.whatsappAt.getTime();
    return sinceWhatsApp >= CASCADE_STEP_MS ? 'sms' : null;
  }
  return null;
}
