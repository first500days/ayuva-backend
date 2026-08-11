const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

/**
 * Reads an env var, falling back to a dev-only default everywhere except
 * production. In production, a missing value throws at boot instead of
 * silently shipping the dev default — this is the difference between (say)
 * an empty local Mongo and a hardcoded, git-committed AES key encrypting
 * every patient's medical records in prod with a key anyone can read from
 * source control (Session 9 finding).
 */
function required(envVar: string, devFallback: string): string {
  const value = process.env[envVar];
  if (value) return value;
  if (isProduction) {
    throw new Error(
      `${envVar} must be set in production — refusing to silently fall back to a dev/insecure default.`,
    );
  }
  return devFallback;
}

export default () => ({
  nodeEnv,
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongodb: {
    uri: required('MONGODB_URI', 'mongodb://localhost:27017/ayuva'),
  },
  redis: {
    host: required('REDIS_HOST', 'localhost'),
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  googleOAuth: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },
  storage: {
    // Local-disk stand-in for the S3-compatible object store (TRD §2/§6);
    // swap StorageService's implementation for an S3 client later without
    // touching callers, since MedicalRecord.fileRef is just an opaque key.
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
    // 32-byte hex key for AES-256-GCM. The dev fallback below is committed to
    // source control, so it must never reach a production encryption op —
    // required() enforces that.
    encryptionKey: required(
      'STORAGE_ENCRYPTION_KEY',
      '4f8d9a2e1c6b7f3a5d0e8c4b2a9f6d1e3c7b5a8f0d2e4c6b8a1f3d5e7c9b0a2d',
    ),
  },
  // Firebase Cloud Messaging (TRD §2/§8, FR-10.3, FR-7.6). Left unset in dev —
  // NotificationsModule falls back to a log-only sender when incomplete;
  // fcm.provider.ts separately fails fast on this same emptiness in production.
  firebase: {
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  reminders: {
    // How long before a booked slot an appointment reminder fires (FR-7.6).
    appointmentLeadMinutes: parseInt(
      process.env.APPOINTMENT_REMINDER_LEAD_MINUTES ?? '60',
      10,
    ),
    // How many days after a visit a follow-up reminder fires (PRD §7.1 Notifications).
    followUpLeadDays: parseInt(
      process.env.FOLLOW_UP_REMINDER_LEAD_DAYS ?? '3',
      10,
    ),
  },
  // Comma-separated allowed origins for CORS (main.ts) — unset in production
  // means "reject all cross-origin requests" (logged loudly), not "allow all".
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
});
