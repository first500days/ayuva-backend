import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
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
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { GoogleAuthService } from './services/google-auth.service';

const BCRYPT_ROUNDS = 10;
const MONGO_DUPLICATE_KEY_ERROR = 11000;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(HealthProfile.name)
    private readonly healthProfileModel: Model<HealthProfileDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly googleAuthService: GoogleAuthService,
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

    return this.issueTokens(user, false);
  }

  async login(dto: LoginDto): Promise<AuthTokensResponseDto> {
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

    return this.issueTokens(user, await this.hasHealthProfile(user.id));
  }

  async oauthGoogle(dto: GoogleOAuthDto): Promise<AuthTokensResponseDto> {
    const profile = await this.googleAuthService.verify(dto.idToken);
    const email = profile.email.toLowerCase();

    let user = await this.userModel.findOne({ email });
    if (!user) {
      try {
        user = await this.userModel.create({
          fullName: profile.name ?? email,
          email,
          oauthId: profile.sub,
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
        user.oauthId = profile.sub;
        await user.save();
      }
    }

    return this.issueTokens(user, await this.hasHealthProfile(user.id));
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthTokensResponseDto> {
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

    return this.issueTokens(user, await this.hasHealthProfile(user.id));
  }

  /** FR-2.6: onboarding is skippable — presence of a HealthProfile is informational only, never gates auth. */
  private async hasHealthProfile(userId: string): Promise<boolean> {
    const count = await this.healthProfileModel
      .countDocuments({ userId: new Types.ObjectId(userId) })
      .limit(1);
    return count > 0;
  }

  private async issueTokens(
    user: UserDocument,
    onboardingComplete: boolean,
  ): Promise<AuthTokensResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      } as JwtSignOptions),
    ]);

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
