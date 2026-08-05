import { Injectable, Logger } from '@nestjs/common';
import { FcmPayload, FcmSender } from './fcm-sender.interface';

/** Safe fallback used whenever Firebase credentials aren't configured (local dev/tests) —
 * logs what would have been sent instead of calling out to FCM. */
@Injectable()
export class LogFcmSender implements FcmSender {
  private readonly logger = new Logger(LogFcmSender.name);

  async send(token: string, payload: FcmPayload): Promise<void> {
    this.logger.log(
      `[log-only FCM] -> token=${token.slice(0, 12)}… title="${payload.title}" body="${payload.body}"`,
    );
  }
}
