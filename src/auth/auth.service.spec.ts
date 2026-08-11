import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { AuthService } from './auth.service';
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

  const service = new AuthService(
    userModel as any,
    healthProfileModel as any,
    jwtService as any,
    configService as any,
    googleAuthService as any,
    auditLogService as any,
  );

  return {
    service,
    userModel,
    healthProfileModel,
    jwtService,
    configService,
    googleAuthService,
    auditLogService,
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
      expect(result.user.onboardingComplete).toBe(false);
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
