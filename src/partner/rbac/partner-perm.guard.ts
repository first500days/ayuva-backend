import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  PartnerContext,
  PartnerContextService,
} from '../partner-context.service';
import { Perm } from './partner-permissions';

const PERMS_KEY = 'partner:perms';

/** Every listed permission is required. Without it the route only needs a live membership. */
export const RequirePerm = (...perms: Perm[]) => SetMetadata(PERMS_KEY, perms);

/** The acting staff member — the context plus who and from where, for audit entries. */
export interface PartnerActor extends PartnerContext {
  userId: string;
  ip?: string;
}

type PartnerRequest = Request & {
  user?: JwtPayload;
  partnerActor?: PartnerActor;
};

/**
 * Resolves the caller's organisation + role (must run after JwtAuthGuard and
 * RolesGuard(PARTNER)), rejects missing permissions, and hands the resolved
 * context to the handler via @PartnerCtx().
 */
@Injectable()
export class PartnerPermGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: PartnerContextService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<PartnerRequest>();
    const userId = request.user?.sub;
    if (!userId) return false;

    const resolved = await this.context.requireLiveContext(userId);
    const required =
      this.reflector.getAllAndOverride<Perm[]>(PERMS_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    const missing = required.filter((p) => !resolved.permissions.includes(p));
    if (missing.length) {
      throw new ForbiddenException(
        `Your role (${resolved.role}) does not allow this action`,
      );
    }
    request.partnerActor = { ...resolved, userId, ip: request.ip };
    return true;
  }
}

export const PartnerCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<PartnerRequest>();
    if (!request.partnerActor) {
      throw new ForbiddenException(
        'Partner context missing — is PartnerPermGuard applied?',
      );
    }
    return request.partnerActor;
  },
);
