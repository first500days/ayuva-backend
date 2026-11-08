export const FCM_SENDER = 'FCM_SENDER';

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** The token will never work again (app removed, token rotated): forget it. */
export class PushTokenGoneError extends Error {
  constructor(message = 'Push token is no longer registered') {
    super(message);
    this.name = 'PushTokenGoneError';
  }
}

/** Pluggable push transport — swap the real Firebase implementation for a
 * log-only stand-in wherever FCM credentials aren't configured (local dev, tests). */
export interface FcmSender {
  send(token: string, payload: FcmPayload): Promise<void>;
  /**
   * Shows the notification and also wakes the app so it can sync in the
   * background. The payload passes through Google or Apple, so `title` and
   * `body` stay generic and `data` carries opaque ids only.
   */
  sendAndWake(token: string, payload: FcmPayload): Promise<void>;
}
