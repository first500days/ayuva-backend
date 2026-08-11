import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import {
  CURRENT_CONSENT_VERSION,
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../../core/users/schemas/user.schema';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Enforces PRD FR-1.5 at the API layer, not just at signup: a patient whose
 * accepted consent version is stale is rejected from protected routes until
 * they re-accept via PUT /auth/consent. Must run after JwtAuthGuard in the
 * same @UseGuards(...) array so request.user is already populated.
 *
 * Admin accounts are out of scope — consent capture only exists on the
 * patient registration/OAuth flow (AuthService always creates role: PATIENT).
 */
@Injectable()
export class ConsentGuard implements CanActivate {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const payload = request.user;
    if (!payload || payload.role === UserRole.ADMIN) {
      return true;
    }

    const user = await this.userModel
      .findById(payload.sub)
      .select('consent status')
      .exec();
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('This account has been deactivated');
    }
    if (user.consent.version !== CURRENT_CONSENT_VERSION) {
      throw new ForbiddenException(
        'Please accept the latest Terms of Service, Privacy Policy, and health-data processing consent to continue (PUT /auth/consent).',
      );
    }
    return true;
  }
}
