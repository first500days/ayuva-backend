export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongodb: {
    uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ayuva',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
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
    // 32-byte hex key for AES-256-GCM; dev-only fallback, override in every real environment.
    encryptionKey:
      process.env.STORAGE_ENCRYPTION_KEY ??
      '4f8d9a2e1c6b7f3a5d0e8c4b2a9f6d1e3c7b5a8f0d2e4c6b8a1f3d5e7c9b0a2d',
  },
  // Firebase Cloud Messaging (TRD §2/§8, FR-10.3, FR-7.6). Left unset in dev —
  // NotificationsModule falls back to a log-only sender when incomplete.
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
  },
});
