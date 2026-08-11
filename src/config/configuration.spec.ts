describe('configuration', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  const REQUIRED_VARS = [
    'MONGODB_URI',
    'REDIS_HOST',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'STORAGE_ENCRYPTION_KEY',
  ];

  it('falls back to dev defaults in development when required vars are unset', () => {
    process.env.NODE_ENV = 'development';
    for (const key of REQUIRED_VARS) delete process.env[key];

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const configuration = require('./configuration').default;
    const config = configuration();

    expect(config.mongodb.uri).toBe('mongodb://localhost:27017/ayuva');
    expect(config.jwt.accessSecret).toBe('dev-access-secret');
    expect(config.storage.encryptionKey).toBe(
      '4f8d9a2e1c6b7f3a5d0e8c4b2a9f6d1e3c7b5a8f0d2e4c6b8a1f3d5e7c9b0a2d',
    );
  });

  it.each(REQUIRED_VARS)(
    'throws at load time in production when %s is unset',
    (missingVar) => {
      process.env.NODE_ENV = 'production';
      for (const key of REQUIRED_VARS) {
        process.env[key] = key === missingVar ? '' : 'set-value';
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const configuration = require('./configuration').default;
      expect(() => configuration()).toThrow(new RegExp(missingVar));
    },
  );

  it('uses real env values in production when every required var is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb://prod-host/ayuva';
    process.env.REDIS_HOST = 'prod-redis';
    process.env.JWT_ACCESS_SECRET = 'real-access-secret';
    process.env.JWT_REFRESH_SECRET = 'real-refresh-secret';
    process.env.STORAGE_ENCRYPTION_KEY = 'a'.repeat(64);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const configuration = require('./configuration').default;
    const config = configuration();

    expect(config.mongodb.uri).toBe('mongodb://prod-host/ayuva');
    expect(config.storage.encryptionKey).toBe('a'.repeat(64));
  });
});
