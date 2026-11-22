import { Injectable, Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { FcmPayload, FcmSender, PushTokenGoneError } from './fcm-sender.interface';

const GONE_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Real Firebase Cloud Messaging transport — only constructed when the
 * initialized `firebase-admin` App is available (see fcm.provider.ts). */
@Injectable()
export class FirebaseFcmSender implements FcmSender {
  private readonly logger = new Logger(FirebaseFcmSender.name);

  constructor(private readonly app: App) {}

  send(token: string, payload: FcmPayload): Promise<void> {
    return this.dispatch(token, {
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    });
  }

  sendAndWake(token: string, payload: FcmPayload): Promise<void> {
    // Data-only on purpose: Android then hands it to expo-notifications, which
    // shows `title` / `message` itself and also runs the app's background
    // task. A `notification` message would skip the task while the app is
    // closed. `body` is the JSON the app receives as the notification's data.
    return this.dispatch(token, {
      data: {
        title: payload.title,
        message: payload.body,
        body: JSON.stringify(payload.data ?? {}),
      },
      android: { priority: 'high' },
    });
  }

  private async dispatch(
    token: string,
    message: {
      notification?: { title: string; body: string };
      data?: Record<string, string>;
      android?: { priority: 'high' };
    },
  ): Promise<void> {
    try {
      await getMessaging(this.app).send({ token, ...message });
    } catch (err) {
      if (GONE_CODES.has((err as { code?: string }).code ?? ''))
        throw new PushTokenGoneError();
      this.logger.error(
        `FCM send failed for token=${token.slice(0, 12)}…`,
        err as Error,
      );
      throw err;
    }
  }
}
