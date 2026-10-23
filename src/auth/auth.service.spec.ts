import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
import type { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { TotpService, currentStep, totpCode } from './services/totp.service';
import { UserRole, UserStatus } from '../core/users/schemas/user.schema';

function buildService() {
  const userModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
  };
  const healthProfileModel = {
    countDocuments: jest
      .fn()
      .mockReturnValue({ limit: jest.fn().mockResolvedValue(0) }),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-token'),
    verifyAsync: jest.fn(),
  };
  const configService = { get: jest.fn().mockReturnValue('secret-or-value') };
  const googleAuthService = { verify: jest.fn() };
  const auditLogService = { record: jest.fn().mockResolvedValue(undefined) };
  const mailService = {
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };
  const totp = new TotpService({
    get: () => '4f8d9a2e1c6b7f3a5d0e8c4b2a9f6d1e3c7b5a8f0d2e4c6b8a1f3d5e7c9b0a2d',
  } as any);
  const adminAccess = {
    resolve: jest.fn().mockResolvedValue({
      permissions: ['content:read', 'content:write'],
      roleName: 'Content Admin',
      modules: ['dashboard', 'content'],
      directoryId: 'dir-1',
      active: true,
    }),
    recordLogin: jest.fn().mockResolvedValue(undefined),
  };
  const recordModel = { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }) };

  const service = new AuthService(
    userModel as any,
    healthProfileModel as any,
    jwtService as any,
    configService as any,
    googleAuthService as any,
    auditLogService as any,
    mailService as any,
    totp,
    adminAccess as any,
    recordModel as any,
  );

  return {
    service,
    userModel,
    healthProfileModel,
    jwtService,
    configService,
    googleAuthService,
    auditLogService,
    mailService,
    totp,
    adminAccess,
    recordModel,
  };
}

/** An admin login document as AuthService sees it (mongoose doc stand-in). */
async function adminUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'admin-1',
    id: 'admin-1',
    fullName: 'Ops Admin',
    email: 'ops@ayuva.health',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    passwordHash: await bcrypt.hash('CorrectPassword1', 4),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const VALID_CONSENT = {
  termsAccepted: true,
  privacyAccepted: true,
  healthDataProcessingAccepted: true,
};

describe('AuthService', () => {
  describe('register', () => {
    it('throws ConflictException when the email is already registered (duplicate key error)', async () => {
      const { service, userModel } = buildService();
      userModel.create.mockRejectedValue({ code: 11000 });

      await expect(
        service.register({
          fullName: 'Amara Okafor',
          email: 'amara.o@example.com',
          password: 'Password123',
          consent: VALID_CONSENT,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows non-duplicate-key errors unchanged', async () => {
      const { service, userModel } = buildService();
      const dbError = new Error('connection lost');
      userModel.create.mockRejectedValue(dbError);

      await expect(
        service.register({
          fullName: 'Amara Okafor',
          email: 'amara.o@example.com',
          password: 'Password123',
          consent: VALID_CONSENT,
        }),
      ).rejects.toBe(dbError);
    });

    it('issues tokens with onboardingComplete=false for a freshly registered user', async () => {
      const { service, userModel, auditLogService } = buildService();
      userModel.create.mockResolvedValue({
        id: 'user-1',
        fullName: 'Amara Okafor',
        email: 'amara.o@example.com',
        role: UserRole.PATIENT,
      });

      const result = await service.register({
        fullName: 'Amara Okafor',
        email: 'amara.o@example.com',
        password: 'Password123',
        consent: VALID_CONSENT,
      });

      expect(result.user.onboardingComplete).toBe(false);
      expect(result.accessToken).toBe('signed-token');
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: 'user-1', action: 'register' }),
      );
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when no user exists for the email', async () => {
      const { service, userModel } = buildService();
      userModel.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      const { service, userModel } = buildService();
      const passwordHash = await bcrypt.hash('CorrectPassword1', 10);
      userModel.findOne.mockResolvedValue({
        passwordHash,
        status: UserStatus.ACTIVE,
      });

      await expect(
        service.login({
          email: 'amara.o@example.com',
          password: 'WrongPassword1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for a deactivated account, even with the correct password', async () => {
      const { service, userModel } = buildService();
      const passwordHash = await bcrypt.hash('CorrectPassword1', 10);
      userModel.findOne.mockResolvedValue({
        passwordHash,
        status: UserStatus.INACTIVE,
      });

      await expect(
        service.login({
          email: 'amara.o@example.com',
          password: 'CorrectPassword1',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for an OAuth-only account with no passwordHash', async () => {
      const { service, userModel } = buildService();
      userModel.findOne.mockResolvedValue({
        passwordHash: undefined,
        status: UserStatus.ACTIVE,
      });

      await expect(
        service.login({ email: 'amara.o@example.com', password: 'anything' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('admin MFA (mandatory)', () => {
    it('gives an un-enrolled admin an enrolment challenge and no tokens', async () => {
      const { service, userModel, jwtService } = buildService();
      userModel.findOne.mockResolvedValue(await adminUser());
      jwtService.signAsync.mockResolvedValue('mfa-token');

      const result = (await service.login({
        email: 'ops@ayuva.health',
        password: 'CorrectPassword1',
      })) as any;

      expect(result.accessToken).toBeUndefined();
      expect(result).toEqual(
        expect.objectContaining({ mfaRequired: true, mfaToken: 'mfa-token' }),
      );
      expect(result.enrollment.otpauthUrl).toContain(`secret=${result.enrollment.secret}`);
      // The challenge token is signed with its own secret, never the access one.
      const [, options] = jwtService.signAsync.mock.calls[0];
      expect(options.secret).toMatch(/:admin-mfa$/);
    });

    it('gives an enrolled admin a plain challenge without a new secret', async () => {
      const { service, userModel, totp } = buildService();
      userModel.findOne.mockResolvedValue(
        await adminUser({ mfa: { enabled: true, secretEnc: totp.encrypt(totp.generateSecret()) } }),
      );

      const result = (await service.login({
        email: 'ops@ayuva.health',
        password: 'CorrectPassword1',
      })) as any;

      expect(result.mfaRequired).toBe(true);
      expect(result.enrollment).toBeUndefined();
    });

    it('refuses a deactivated admin before any challenge', async () => {
      const { service, userModel, adminAccess } = buildService();
      userModel.findOne.mockResolvedValue(await adminUser());
      adminAccess.resolve.mockResolvedValue({ active: false, permissions: [] });

      await expect(
        service.login({ email: 'ops@ayuva.health', password: 'CorrectPassword1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('enrols on the first correct code and issues tokens carrying mfa + role permissions', async () => {
      const { service, userModel, jwtService, totp } = buildService();
      const secret = totp.generateSecret();
      const user = await adminUser();
      userModel.findById.mockResolvedValue(user);
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'admin-1',
        purpose: 'admin_mfa',
        enroll: totp.encrypt(secret),
      });

      const result = await service.verifyAdminMfa({
        mfaToken: 'mfa-token',
        code: totpCode(secret, currentStep()),
      });

      expect(result.accessToken).toBe('signed-token');
      expect((user as any).mfa).toEqual(expect.objectContaining({ enabled: true }));
      expect(totp.decrypt((user as any).mfa.secretEnc)).toBe(secret);
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ mfa: true, perms: ['content:read', 'content:write'] }),
      );
    });

    it('rejects a wrong code and counts the failure', async () => {
      const { service, userModel, jwtService, totp } = buildService();
      const secret = totp.generateSecret();
      userModel.findById.mockResolvedValue(
        await adminUser({ mfa: { enabled: true, secretEnc: totp.encrypt(secret), failedAttempts: 0 } }),
      );
      (userModel as any).updateOne = jest.fn().mockResolvedValue({});
      jwtService.verifyAsync.mockResolvedValue({ sub: 'admin-1', purpose: 'admin_mfa' });

      const wrong = totpCode(secret, currentStep()) === '000000' ? '111111' : '000000';
      await expect(
        service.verifyAdminMfa({ mfaToken: 'mfa-token', code: wrong }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect((userModel as any).updateOne).toHaveBeenCalledWith(
        { _id: 'admin-1' },
        { $set: { 'mfa.failedAttempts': 1 } },
      );
    });

    it('refuses an admin refresh token minted without MFA', async () => {
      const { service, jwtService, userModel } = buildService();
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'admin-1',
        email: 'ops@ayuva.health',
        role: UserRole.ADMIN,
      });
      userModel.findById.mockResolvedValue(await adminUser());

      await expect(
        service.refresh({ refreshToken: 'pre-mfa-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when the refresh token fails verification', async () => {
      const { service, jwtService } = buildService();
      jwtService.verifyAsync.mockRejectedValue(new Error('bad signature'));

      await expect(
        service.refresh({ refreshToken: 'garbage' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the token is valid but the user no longer exists', async () => {
      const { service, jwtService, userModel } = buildService();
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'a@b.com',
        role: UserRole.PATIENT,
      });
      userModel.findById.mockResolvedValue(null);

      await expect(
        service.refresh({ refreshToken: 'valid-but-orphaned' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException when the user tied to the token has been deactivated', async () => {
      const { service, jwtService, userModel } = buildService();
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'a@b.com',
        role: UserRole.PATIENT,
      });
      userModel.findById.mockResolvedValue({
        id: 'user-1',
        status: UserStatus.INACTIVE,
      });

      await expect(
        service.refresh({ refreshToken: 'valid' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('oauthGoogle', () => {
    it('creates a new account on first-time Google sign-in and requires consent to have been supplied', async () => {
      const { service, googleAuthService, userModel } = buildService();
      googleAuthService.verify.mockResolvedValue({
        sub: 'google-1',
        email: 'amara.o@example.com',
        name: 'Amara',
      });
      userModel.findOne.mockResolvedValue(null);
      userModel.create.mockResolvedValue({
        id: new Types.ObjectId().toString(),
        fullName: 'Amara',
        email: 'amara.o@example.com',
        role: UserRole.PATIENT,
      });

      const result = await service.oauthGoogle({
        idToken: 'valid-token',
        consent: VALID_CONSENT,
      });

      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          oauthId: 'google-1',
          email: 'amara.o@example.com',
        }),
      );
      expect((result as AuthTokensResponseDto).user.onboardingComplete).toBe(false);
    });

    it('throws UnauthorizedException when an existing linked account has been deactivated', async () => {
      const { service, googleAuthService, userModel } = buildService();
      googleAuthService.verify.mockResolvedValue({
        sub: 'google-1',
        email: 'amara.o@example.com',
      });
      userModel.findOne.mockResolvedValue({
        status: UserStatus.INACTIVE,
        oauthId: 'google-1',
      });

      await expect(
        service.oauthGoogle({ idToken: 'valid-token', consent: VALID_CONSENT }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
