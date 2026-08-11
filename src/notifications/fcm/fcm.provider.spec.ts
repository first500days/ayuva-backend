jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn().mockReturnValue({ name: 'ayuva-fcm' }),
  getApps: jest.fn().mockReturnValue([]),
  cert: jest.fn(),
}));

import { fcmSenderProvider } from './fcm.provider';
import { LogFcmSender } from './log-fcm.sender';
import { FirebaseFcmSender } from './firebase-fcm.sender';

function useFactory(config: Record<string, unknown>) {
  const configService = { get: jest.fn((key: string) => config[key]) };
  const factory = (fcmSenderProvider as any).useFactory;
  return factory(configService as any);
}

describe('fcmSenderProvider', () => {
  it('falls back to LogFcmSender when FCM credentials are not fully configured', () => {
    const sender = useFactory({});
    expect(sender).toBeInstanceOf(LogFcmSender);
  });

  it('falls back to LogFcmSender when only some credentials are present', () => {
    const sender = useFactory({ 'firebase.projectId': 'my-project' });
    expect(sender).toBeInstanceOf(LogFcmSender);
  });

  it('constructs FirebaseFcmSender when all credentials are configured', () => {
    const sender = useFactory({
      'firebase.projectId': 'my-project',
      'firebase.clientEmail': 'svc@my-project.iam.gserviceaccount.com',
      'firebase.privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    });
    expect(sender).toBeInstanceOf(FirebaseFcmSender);
  });

  it('throws instead of silently falling back to LogFcmSender when credentials are missing in production', () => {
    expect(() => useFactory({ nodeEnv: 'production' })).toThrow(/FCM credentials missing/);
  });

  it('still constructs FirebaseFcmSender in production when credentials are present', () => {
    const sender = useFactory({
      nodeEnv: 'production',
      'firebase.projectId': 'my-project',
      'firebase.clientEmail': 'svc@my-project.iam.gserviceaccount.com',
      'firebase.privateKey': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    });
    expect(sender).toBeInstanceOf(FirebaseFcmSender);
  });
});
