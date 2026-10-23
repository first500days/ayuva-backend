import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserRole } from '../../core/users/schemas/user.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    // MFA is mandatory for admins: a token minted without the second factor
    // (e.g. before MFA existed) is refused everywhere, which signs them out.
    if (payload.role === UserRole.ADMIN && payload.mfa !== true) {
      throw new UnauthorizedException('Multi-factor authentication is required — please sign in again');
    }
    return payload;
  }
}
