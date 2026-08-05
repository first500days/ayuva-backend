export const FCM_SENDER = 'FCM_SENDER';

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Pluggable push transport — swap the real Firebase implementation for a
 * log-only stand-in wherever FCM credentials aren't configured (local dev, tests). */
export interface FcmSender {
  send(token: string, payload: FcmPayload): Promise<void>;
}
