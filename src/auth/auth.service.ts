import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Model, Types } from 'mongoose';
import {
  CURRENT_CONSENT_VERSION,
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../core/users/schemas/user.schema';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../core/health-profile/schemas/health-profile.schema';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleOAuthDto } from './dto/google-oauth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ConsentDto } from './dto/consent.dto';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { RefreshTokenResponseDto } from './dto/refresh-token-response.dto';
import { ConsentStatusResponseDto } from './dto/consent-status-response.dto';
import { AdminMfaChallengeDto, VerifyMfaDto } from './dto/admin-mfa.dto';
import { GoogleAuthService } from './services/google-auth.service';
import { TotpService, verifyTotp } from './services/totp.service';
import { AdminAccessService } from './services/admin-access.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/schemas/audit-log.schema';
import { MailService } from '../mail/mail.service';
import {
  MedicalRecord,
  MedicalRecordDocument,
  consentTokenFor,
} from '../core/records/schemas/medical-record.schema';

const BCRYPT_ROUNDS = 10;
const MONGO_DUPLICATE_KEY_ERROR = 11000;

const ADMIN_MFA_PURPOSE = 'admin_mfa';
const MAX_MFA_ATTEMPTS = 5;
const MFA_LOCK_MS = 15 * 60 * 1000;

/** The short-lived token between admin sign-in steps 1 and 2. */
interface AdminMfaTokenPayload {
  sub: string;
  purpose: typeof ADMIN_MFA_PURPOSE;
  // Encrypted secret offered for first-time enrolment.
  enroll?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(HealthProfile.name)
    private readonly healthProfileModel: Model<HealthProfileDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly auditLogService: AuditLogService,
    private readonly mailService: MailService,
    private readonly totp: TotpService,
    private readonly adminAccess: AdminAccessService,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    let user: UserDocument;
    try {
      user = await this.userModel.create({
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        passwordHash,
        role: UserRole.PATIENT,
        status: UserStatus.ACTIVE,
        consent: {
          termsAccepted: dto.consent.termsAccepted,
          privacyAccepted: dto.consent.privacyAccepted,
          healthDataProcessingAccepted:
            dto.consent.healthDataProcessingAccepted,
          version: CURRENT_CONSENT_VERSION,
          acceptedAt: new Date(),
        },
      });
    } catch (err) {
      if (this.isDuplicateKeyError(err)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw err;
    }

    await this.auditLogService.record({
      actorId: user.id,
      action: AuditAction.REGISTER,
      targetType: 'User',
      targetId: user.id,
    });

    return this.issueTokens(user, false);
  }

  async login(
    dto: LoginDto,
  ): Promise<AuthTokensResponseDto | AdminMfaChallengeDto> {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (
      !user?.passwordHash ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('This account has been deactivated');
    }
    // Admins can see patient medical files: no tokens before the second factor.
    if (user.role === UserRole.ADMIN) {
      return this.startAdminMfa(user);
    }

    await this.auditLogService.record({
      actorId: user.id,
      action: AuditAction.LOGIN,
      targetType: 'User',
      targetId: user.id,
    });

    return this.issueTokens(user, await this.hasHealthProfile(user.id));
  }

  async oauthGoogle(
    dto: GoogleOAuthDto,
  ): Promise<AuthTokensResponseDto | AdminMfaChallengeDto> {
    const profile = await this.googleAuthService.verify(dto.idToken);
    const email = profile.email.toLowerCase();

    let user = await this.userModel.findOne({ email });
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      try {
        user = await this.userModel.create({
          fullName: profile.name ?? email,
          email,
          oauthId: profile.sub,
          oauthProvider: 'google',
          role: UserRole.PATIENT,
          status: UserStatus.ACTIVE,
          consent: {
            termsAccepted: dto.consent.termsAccepted,
            privacyAccepted: dto.consent.privacyAccepted,
            healthDataProcessingAccepted:
              dto.consent.healthDataProcessingAccepted,
            version: CURRENT_CONSENT_VERSION,
            acceptedAt: new Date(),
          },
        });
      } catch (err) {
        if (this.isDuplicateKeyError(err)) {
          throw new ConflictException(
            'An account with this email already exists',
          );
        }
        throw err;
      }
    } else {
      if (user.status === UserStatus.INACTIVE) {
        throw new UnauthorizedException('This account has been deactivated');
      }
      if (!user.oauthId) {
        // Only link when Google has verified the email — otherwise anyone
        // who controls an unverified address could hijack an existing
        // password-based account by signing in with Google.
        if (!profile.emailVerified) {
          throw new ConflictException(
            'Email not verified by Google; cannot link account',
          );
        }
        user.oauthId = profile.sub;
        user.oauthProvider = 'google';
        await user.save();
      }
      // Google sign-in doesn't skip the admin second factor either.
      if (user.role === UserRole.ADMIN) {
        return this.startAdminMfa(user);
      }
    }

    await this.auditLogService.record({
      actorId: user.id,
      action: isNewUser ? AuditAction.REGISTER : AuditAction.LOGIN,
      targetType: 'User',
      targetId: user.id,
    });

    return this.issueTokens(user, await this.hasHealthProfile(user.id));
  }

  /** Login for flows that only ever sign in non-admin accounts (partner sign-up, staff invites). */
  async loginForTokens(dto: LoginDto): Promise<AuthTokensResponseDto> {
    const result = await this.login(dto);
    if ('mfaRequired' in result) {
      throw new UnauthorizedException('Admin accounts sign in through the admin panel');
    }
    return result;
  }

  /**
   * Step 2 of admin sign-in: checks the authenticator code against the
   * enrolled secret — or, the first time, against the secret offered at
   * step 1, which this enrols. Five wrong codes lock sign-in for 15 minutes.
   */
  async verifyAdminMfa(dto: VerifyMfaDto): Promise<AuthTokensResponseDto> {
    let payload: AdminMfaTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminMfaTokenPayload>(
        dto.mfaToken,
        { secret: this.mfaTokenSecret() },
      );
    } catch {
      throw new UnauthorizedException(
        'Your sign-in session expired — enter your password again',
      );
    }
    if (payload.purpose !== ADMIN_MFA_PURPOSE) {
      throw new UnauthorizedException('Invalid sign-in session');
    }
    const user = await this.userModel.findById(payload.sub);
    if (
      !user ||
      user.role !== UserRole.ADMIN ||
      user.status === UserStatus.INACTIVE
    ) {
      throw new UnauthorizedException('Invalid sign-in session');
    }
    this.assertMfaNotLocked(user);

    const enrolling = !!payload.enroll;
    if (!enrolling && !user.mfa?.secretEnc) {
      throw new UnauthorizedException(
        'Set up your authenticator app first — sign in again',
      );
    }
    const secret = this.totp.decrypt(
      enrolling ? payload.enroll! : user.mfa!.secretEnc!,
    );
    const step = verifyTotp(
      secret,
      dto.code,
      enrolling ? undefined : user.mfa?.lastUsedStep,
    );
    if (step === null) {
      await this.recordFailedMfa(user);
      throw new UnauthorizedException(
        'That code didn’t match. Check your authenticator app and try again.',
      );
    }

    const access = await this.adminAccess.resolve(user);
    if (!access.active) {
      throw new UnauthorizedException('Your admin access has been deactivated');
    }
    user.mfa = {
      enabled: true,
      secretEnc: enrolling ? this.totp.encrypt(secret) : user.mfa!.secretEnc,
      enrolledAt: enrolling ? new Date() : user.mfa!.enrolledAt,
      lastUsedStep: step,
      failedAttempts: 0,
    };
    user.lastLoginAt = new Date();
    await user.save();
    await this.adminAccess.recordLogin(access.directoryId, user.id);

    if (enrolling) {
      await this.auditLogService.record({
        actorId: user.id,
        action: AuditAction.ADMIN_MFA_ENROLL,
        targetType: 'User',
        targetId: user.id,
      });
    }
    await this.auditLogService.record({
      actorId: user.id,
      action: AuditAction.LOGIN,
      targetType: 'User',
      targetId: user.id,
      metadata: { mfa: true },
    });
    return this.issueTokens(user, true, {
      mfa: true,
      perms: access.permissions,
    });
  }

  /** Step 1 answer for an admin: a challenge (plus a new secret if not yet enrolled). */
  private async startAdminMfa(user: UserDocument): Promise<AdminMfaChallengeDto> {
    const access = await this.adminAccess.resolve(user);
    if (!access.active) {
      throw new UnauthorizedException('Your admin access has been deactivated');
    }
    this.assertMfaNotLocked(user);

    if (user.mfa?.enabled && user.mfa.secretEnc) {
      return { mfaRequired: true, mfaToken: await this.signMfaToken(user.id) };
    }
    const secret = this.totp.generateSecret();
    const otpauthUrl = this.totp.otpauthUrl(secret, user.email);
    return {
      mfaRequired: true,
      mfaToken: await this.signMfaToken(user.id, this.totp.encrypt(secret)),
      enrollment: { secret, otpauthUrl, qrSvg: await this.totp.qrSvg(otpauthUrl) },
    };
  }

  private signMfaToken(userId: string, enroll?: string): Promise<string> {
    const payload: AdminMfaTokenPayload = {
      sub: userId,
      purpose: ADMIN_MFA_PURPOSE,
      ...(enroll && { enroll }),
    };
    // Own secret: this token must never pass as an access or refresh token.
    return this.jwtService.signAsync(payload, {
      secret: this.mfaTokenSecret(),
      expiresIn: '10m',
    } as JwtSignOptions);
  }

  private mfaTokenSecret(): string {
    return `${this.configService.get<string>('jwt.accessSecret')}:admin-mfa`;
  }

  private assertMfaNotLocked(user: UserDocument): void {
    const lockedUntil = user.mfa?.lockedUntil;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
      throw new HttpException(
        `Too many incorrect codes. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailedMfa(user: UserDocument): Promise<void> {
    const failedAttempts = (user.mfa?.failedAttempts ?? 0) + 1;
    const lock = failedAttempts >= MAX_MFA_ATTEMPTS;
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          'mfa.failedAttempts': lock ? 0 : failedAttempts,
          ...(lock && { 'mfa.lockedUntil': new Date(Date.now() + MFA_LOCK_MS) }),
        },
      },
    );
    await this.auditLogService.record({
      actorId: user.id,
      action: AuditAction.ADMIN_MFA_FAILED,
      targetType: 'User',
      targetId: user.id,
      metadata: { attempt: failedAttempts, locked: lock },
    });
  }

  /**
   * Lets an authenticated user re-accept consent when CURRENT_CONSENT_VERSION
   * has moved past what they accepted at signup — the only way to recover
   * from ConsentGuard rejecting their requests (see auth/guards/consent.guard.ts).
   */
  async updateConsent(
    userId: string,
    dto: ConsentDto,
  ): Promise<ConsentStatusResponseDto> {
    const acceptedAt = new Date();
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          consent: {
            termsAccepted: dto.termsAccepted,
            privacyAccepted: dto.privacyAccepted,
            healthDataProcessingAccepted: dto.healthDataProcessingAccepted,
            version: CURRENT_CONSENT_VERSION,
            acceptedAt,
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Consent given now also covers documents uploaded while it was off:
    // attach this consent to every record that has no accepted token yet.
    if (dto.healthDataProcessingAccepted) {
      await this.recordModel.updateMany(
        {
          patientId: user._id,
          'consentToken.healthDataProcessingAccepted': { $ne: true },
        },
        { $set: { consentToken: consentTokenFor(user.id, user.consent, 'reconsent') } },
      );
    }
    return { version: CURRENT_CONSENT_VERSION, acceptedAt: acceptedAt.toISOString() };
  }

  async refresh(dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(
        dto.refreshToken,
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.userModel.findById(payload.sub);
    if (!user || user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // An admin refresh token from before MFA can't be traded in, and role
    // changes take effect at the next refresh.
    if (user.role === UserRole.ADMIN) {
      if (payload.mfa !== true) {
        throw new UnauthorizedException(
          'Multi-factor authentication is required — please sign in again',
        );
      }
      const access = await this.adminAccess.resolve(user);
      if (!access.active) {
        throw new UnauthorizedException('Your admin access has been deactivated');
      }
      return this.signTokenPair(user, { mfa: true, perms: access.permissions });
    }

    // No `user` in the response here — the client already has it cached and
    // only calls this endpoint transparently on a 401 to mint a new pair.
    return this.signTokenPair(user);
  }

  async forgotPassword(dto: { email: string }): Promise<void> {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });

    // Silently no-op for unknown emails and OAuth-only accounts — the
    // response is identical either way so this endpoint can't be used to
    // enumerate registered addresses.
    if (!user || !user.passwordHash) {
      return;
    }

    // 6-digit code (not a link) — the mobile client has the user type this
    // into a reset-password screen rather than following a deep link.
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 3600000);

    await this.userModel.findByIdAndUpdate(user.id, {
      resetPasswordCode: code,
      resetPasswordCodeExpiresAt: expiresAt,
    });

    await this.mailService.sendPasswordResetEmail(user.email, code);

    await this.auditLogService.record({
      actorId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      targetType: 'User',
      targetId: user.id,
    });
  }

  async resetPassword(dto: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<void> {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
      resetPasswordCode: dto.code,
      resetPasswordCodeExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.userModel.findByIdAndUpdate(user.id, {
      passwordHash,
      resetPasswordCode: null,
      resetPasswordCodeExpiresAt: null,
    });

    await this.auditLogService.record({
      actorId: user.id,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      targetType: 'User',
      targetId: user.id,
    });
  }

  /**
   * Soft-deletes and anonymises the authenticated user's account (DPDP / GDPR
   * right to erasure). A hard delete is intentionally avoided so that foreign
   * references in appointments, records, and the immutable audit log remain
   * intact. PII is overwritten so no personal data is retained.
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        status: UserStatus.DEACTIVATED,
        deactivatedAt: new Date(),
        // Anonymise all PII fields so the record retains no personal data.
        fullName: 'Deleted User',
        email: `deleted+${userId}@ayuva.internal`,
        passwordHash: undefined,
        oauthId: undefined,
        oauthProvider: undefined,
        resetPasswordCode: undefined,
        resetPasswordCodeExpiresAt: undefined,
      },
    });

    await this.auditLogService.record({
      actorId: user.id,
      action: AuditAction.ACCOUNT_DELETED,
      targetType: 'User',
      targetId: user.id,
    });
  }


  /** FR-2.6: onboarding is skippable — presence of a HealthProfile is informational only, never gates auth. */
  private async hasHealthProfile(userId: string): Promise<boolean> {
    const count = await this.healthProfileModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .limit(1);
    return count > 0;
  }

  private async signTokenPair(
    user: UserDocument,
    adminClaims?: Pick<JwtPayload, 'mfa' | 'perms'>,
  ): Promise<RefreshTokenResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...adminClaims,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      } as JwtSignOptions),
    ]);

    return { accessToken, refreshToken };
  }

  private async issueTokens(
    user: UserDocument,
    onboardingComplete: boolean,
    adminClaims?: Pick<JwtPayload, 'mfa' | 'perms'>,
  ): Promise<AuthTokensResponseDto> {
    const { accessToken, refreshToken } = await this.signTokenPair(
      user,
      adminClaims,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        onboardingComplete,
      },
    };
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR
    );
  }
}
