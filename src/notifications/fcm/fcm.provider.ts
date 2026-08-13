import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { FCM_SENDER } from './fcm-sender.interface';
import { LogFcmSender } from './log-fcm.sender';
import { FirebaseFcmSender } from './firebase-fcm.sender';

const logger = new Logger('FcmProvider');

/** Picks the real Firebase sender when projectId/clientEmail/privateKey are all
 * present in config, otherwise falls back to the log-only sender — so local dev
 * and tests never need real FCM credentials (FR-10.3, FR-7.6).
 *
 * A missing FCM config in production is NOT a silent degrade: LogFcmSender never
 * throws, so every reminder would "succeed" as a log line forever with no signal
 * anywhere that real push was never wired up. Fail fast at boot instead. */
export const fcmSenderProvider: Provider = {
  provide: FCM_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const projectId = config.get<string>('firebase.projectId');
    const clientEmail = config.get<string>('firebase.clientEmail');
    const privateKey = config.get<string>('firebase.privateKey');

    if (!projectId || !clientEmail || !privateKey) {
      const isProduction = config.get<string>('nodeEnv') === 'production';
      const logOnlyAllowed = config.get<boolean>('firebase.logOnly');
      if (isProduction && !logOnlyAllowed) {
        throw new Error(
          'FCM credentials missing in a production build — set FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY (or FCM_LOG_ONLY=true to allow the log-only sender). Refusing to silently fall back to the log-only sender in production.',
        );
      }
      logger.warn(
        'FCM credentials not configured — using log-only push sender. Set FCM_PROJECT_ID/FCM_CLIENT_EMAIL/FCM_PRIVATE_KEY to enable real push.',
      );
      return new LogFcmSender();
    }

    const app =
      getApps().find((a) => a.name === 'ayuva-fcm') ??
      initializeApp(
        { credential: cert({ projectId, clientEmail, privateKey }) },
        'ayuva-fcm',
      );
    return new FirebaseFcmSender(app);
  },
};
