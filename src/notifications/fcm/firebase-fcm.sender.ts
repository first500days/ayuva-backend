import { Injectable, Logger } from '@nestjs/common';
import type { App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { FcmPayload, FcmSender } from './fcm-sender.interface';

/** Real Firebase Cloud Messaging transport — only constructed when the
 * initialized `firebase-admin` App is available (see fcm.provider.ts). */
@Injectable()
export class FirebaseFcmSender implements FcmSender {
  private readonly logger = new Logger(FirebaseFcmSender.name);

  constructor(private readonly app: App) {}

  async send(token: string, payload: FcmPayload): Promise<void> {
    try {
      await getMessaging(this.app).send({
        token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
      });
    } catch (err) {
      this.logger.error(
        `FCM send failed for token=${token.slice(0, 12)}…`,
        err as Error,
      );
      throw err;
    }
  }
}
