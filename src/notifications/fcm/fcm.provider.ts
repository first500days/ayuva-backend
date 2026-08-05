import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { FCM_SENDER } from './fcm-sender.interface';
import { LogFcmSender } from './log-fcm.sender';
import { FirebaseFcmSender } from './firebase-fcm.sender';

const logger = new Logger('FcmProvider');

/** Picks the real Firebase sender when projectId/clientEmail/privateKey are all
 * present in config, otherwise falls back to the log-only sender — so local dev
 * and tests never need real FCM credentials (FR-10.3, FR-7.6). */
export const fcmSenderProvider: Provider = {
  provide: FCM_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const projectId = config.get<string>('firebase.projectId');
    const clientEmail = config.get<string>('firebase.clientEmail');
    const privateKey = config.get<string>('firebase.privateKey');

    if (!projectId || !clientEmail || !privateKey) {
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
