import {
  FamilyAccess,
  FamilyAccessDocument,
} from '../../core/family/schemas/family-access.schema';
import {
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Model, Types } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  JwtPayload,
  FACILITY_LOCKED,
  SESSION_REPLACED,
} from '../interfaces/jwt-payload.interface';
import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../../core/users/schemas/user.schema';
import {
  SESSION_REVOKED,
  TokenRevocationService,
} from '../services/token-revocation.service';

/** Header the app sends while a guardian is viewing a family member's profile. */
export const PROFILE_HEADER = 'x-ayuva-profile';

/**
 * The family member's own health data — the only paths a guardian acts on
 * for them. Everything else (sign-in, account, devices, notifications,
 * family management, billing…) always stays the signed-in person's.
 */
const ACTING_PATHS =
  /^(?:\/api\/v\d+)?\/(appointments|care-journey|dashboard|medications|nav-intent|prep-pack|profile\/(health|medications|emergency-contact|intake-qr)|records|report-interpreter|sharing|ai\/chat)(\/|\?|$)/;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly revocation: TokenRevocationService,
    @Optional()
    @InjectModel(FamilyAccess.name)
    private readonly familyAccessModel?: Model<FamilyAccessDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: JwtPayload & { iat?: number },
  ): Promise<JwtPayload> {
    if (await this.revocation.isRevoked(payload.sub, payload.iat))
      throw new UnauthorizedException(
        `${SESSION_REVOKED}: an administrator ended this session — please sign in again`,
      );
    // MFA is mandatory for admins: a token minted without the second factor
    // (e.g. before MFA existed) is refused everywhere, which signs them out.
    if (payload.role === UserRole.ADMIN && payload.mfa !== true) {
      throw new UnauthorizedException(
        'Multi-factor authentication is required — please sign in again',
      );
    }
    if (payload.role === UserRole.PARTNER)
      await this.assertCurrentSession(payload);
    return this.actingAs(req, payload);
  }

  /** One sign-in per Partner Portal login: a newer one ends this token at once. */
  private async assertCurrentSession(payload: JwtPayload): Promise<void> {
    const user = await this.userModel
      .findById(payload.sub)
      .select('partnerSessionId facilityLockedAt')
      .lean()
      .exec();
    if (user?.facilityLockedAt)
      throw new UnauthorizedException(
        `${FACILITY_LOCKED}: Ayuva has locked access for your organisation`,
      );
    if (user?.partnerSessionId && user.partnerSessionId !== payload.sid)
      throw new UnauthorizedException(
        `${SESSION_REPLACED}: this account signed in somewhere else`,
      );
  }

  /**
   * Family profiles: on health-data paths, a guardian's request runs as the
   * family member they've switched to — only if they manage that member.
   */
  private async actingAs(
    req: Request,
    payload: JwtPayload,
  ): Promise<JwtPayload> {
    const profile = req.headers[PROFILE_HEADER];
    if (typeof profile !== 'string' || !profile || profile === payload.sub)
      return payload;
    if (payload.role !== UserRole.PATIENT) return payload;
    if (!ACTING_PATHS.test(req.originalUrl ?? req.url)) return payload;
    const manages =
      Types.ObjectId.isValid(profile) &&
      (await this.userModel.exists({
        _id: profile,
        managedBy: new Types.ObjectId(payload.sub),
        status: UserStatus.ACTIVE,
      }));
    if (!manages) {
      // Access another guardian gave this account, with its permission level.
      const shared = Types.ObjectId.isValid(profile)
        ? await this.familyAccessModel
            ?.findOne({
              profileId: new Types.ObjectId(profile),
              userId: new Types.ObjectId(payload.sub),
            })
            .select('level')
            .lean()
            .exec()
        : null;
      if (!shared)
        throw new ForbiddenException('You don’t manage this family profile');
      if (
        shared.level === 'view' &&
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      )
        throw new ForbiddenException(
          'You can view this family profile but not make changes for it',
        );
    }
    return { ...payload, sub: profile, guardian: payload.sub };
  }
}
