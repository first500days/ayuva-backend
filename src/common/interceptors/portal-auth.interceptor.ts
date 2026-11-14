import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserRole } from '../../core/users/schemas/user.schema';
import {
  assertPortalRole,
  portalRoleForHost,
  roleFromToken,
} from '../portal-host';

/** Withholds sign-in / refresh results from a portal host the account doesn't belong to. */
@Injectable()
export class PortalAuthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!portalRoleForHost(req)) return next.handle();
    return next.handle().pipe(
      map((res: unknown) => {
        const r = (res ?? {}) as {
          mfaRequired?: boolean;
          accessToken?: string;
          user?: { role?: string };
        };
        // The admin MFA challenge carries no role: it only exists for admins.
        const role = r.mfaRequired
          ? UserRole.ADMIN
          : (r.user?.role ?? roleFromToken(r.accessToken));
        if (r.mfaRequired || r.accessToken) assertPortalRole(req, role);
        return res;
      }),
    );
  }
}
