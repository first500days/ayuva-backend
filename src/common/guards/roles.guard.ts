import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ADMIN_AREAS_KEY } from '../decorators/admin-area.decorator';
import { AdminModuleKey, canUseAdminModule } from '../admin-modules';
import { UserRole } from '../../core/users/schemas/user.schema';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      targets,
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    if (!requiredRoles.includes(request.user?.role as UserRole)) {
      return false;
    }

    // Admins additionally need a role that opens this controller's module(s).
    const areas = this.reflector.getAllAndOverride<AdminModuleKey[]>(
      ADMIN_AREAS_KEY,
      targets,
    );
    if (request.user?.role === UserRole.ADMIN && areas?.length) {
      const perms = request.user.perms ?? [];
      if (!areas.some((area) => canUseAdminModule(perms, area))) {
        throw new ForbiddenException(
          'Your admin role does not include this module',
        );
      }
    }
    return true;
  }
}
