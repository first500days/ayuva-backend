import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../../src/app.module';
import {
  CURRENT_CONSENT_VERSION,
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../../src/core/users/schemas/user.schema';

export interface TestAppContext {
  app: INestApplication;
  testDbName: string;
}

/**
 * mongodb-memory-server's native Windows mongod binary hangs in this
 * environment, so integration tests run against the real cluster
 * (MONGODB_URI from .env — already verified reachable) using a disposable,
 * uniquely-named database that's dropped in closeTestApp(). Never touches
 * the "ayuva" dev database.
 */
function baseMongoUri(): string {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }
  const envPath = join(__dirname, '..', '..', '.env');
  if (!existsSync(envPath)) {
    throw new Error(
      'No MONGODB_URI in env and no .env file found — cannot run integration tests',
    );
  }
  const match = readFileSync(envPath, 'utf8').match(/^MONGODB_URI=(.*)$/m);
  if (!match) {
    throw new Error('.env has no MONGODB_URI');
  }
  return match[1].trim();
}

function rewriteDbName(uri: string, testDbName: string): string {
  // Replace the path segment (db name) between the host and query, regardless of scheme.
  const [beforeQuery, query] = uri.split('?');
  const withoutTrailingSlash = beforeQuery.replace(/\/[^/]*$/, '');
  return `${withoutTrailingSlash}/${testDbName}${query ? `?${query}` : ''}`;
}

export async function createTestApp(): Promise<TestAppContext> {
  const testDbName = `ayuva_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const uri = rewriteDbName(baseMongoUri(), testDbName);

  process.env.MONGODB_URI = uri;
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'docs', 'openapi.json'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();

  return { app, testDbName };
}

export async function closeTestApp(ctx: TestAppContext): Promise<void> {
  const connection = ctx.app.get<Connection>(getConnectionToken());
  await connection.dropDatabase();
  await ctx.app.close();
}

const VALID_CONSENT = {
  termsAccepted: true,
  privacyAccepted: true,
  healthDataProcessingAccepted: true,
};

export async function registerPatient(
  app: INestApplication,
  overrides: { fullName?: string; email: string; password?: string },
): Promise<{ accessToken: string; userId: string }> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      fullName: overrides.fullName ?? 'Test Patient',
      email: overrides.email,
      password: overrides.password ?? 'Password123',
      consent: VALID_CONSENT,
    })
    .expect(201);

  return { accessToken: res.body.accessToken, userId: res.body.user.id };
}

/**
 * No admin sign-up flow exists (admins are provisioned out-of-band, e.g. via
 * seed.ts) — creates the User doc directly with role=admin, then logs in
 * through the real /auth/login endpoint so tests exercise real token issuance.
 */
export async function registerAdmin(
  app: INestApplication,
  overrides: { fullName?: string; email: string; password?: string },
): Promise<{ accessToken: string; userId: string }> {
  const password = overrides.password ?? 'Password123';
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await userModel.create({
    fullName: overrides.fullName ?? 'Test Admin',
    email: overrides.email.toLowerCase(),
    passwordHash,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    consent: {
      termsAccepted: true,
      privacyAccepted: true,
      healthDataProcessingAccepted: true,
      version: CURRENT_CONSENT_VERSION,
      acceptedAt: new Date(),
    },
  });

  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email: overrides.email, password })
    .expect(200);

  return { accessToken: res.body.accessToken, userId: admin.id };
}
