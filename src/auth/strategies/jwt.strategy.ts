import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Model, Types } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import {
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../../core/users/schemas/user.schema';

/** Header the app sends while a guardian is viewing a family member's profile. */
export const PROFILE_HEADER = 'x-ayuva-profile';

/**
 * The family member's own health data — the only paths a guardian acts on
 * for them. Everything else (sign-in, account, devices, notifications,
 * family management, billing…) always stays the signed-in person's.
 */
const ACTING_PATHS =
  /^(?:\/api\/v\d+)?\/(appointments|care-journey|dashboard|medications|nav-intent|prep-pack|profile\/(health|medications|emergency-contact)|records|report-interpreter|sharing|ai\/chat)(\/|\?|$)/;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    // MFA is mandatory for admins: a token minted without the second factor
    // (e.g. before MFA existed) is refused everywhere, which signs them out.
    if (payload.role === UserRole.ADMIN && payload.mfa !== true) {
      throw new UnauthorizedException(
        'Multi-factor authentication is required — please sign in again',
      );
    }
    return this.actingAs(req, payload);
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
    if (!manages)
      throw new ForbiddenException('You don’t manage this family profile');
    return { ...payload, sub: profile, guardian: payload.sub };
  }
}
