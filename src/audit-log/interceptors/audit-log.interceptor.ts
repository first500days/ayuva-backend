import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from '../audit-log.service';
import { AUDIT_EVENT_KEY, AuditEventMetadata } from '../decorators/audit-event.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Logs an AuditLog entry after a route handler marked with @AuditEvent(...)
 * succeeds. Actor is read from the JWT-authenticated request (this
 * interceptor only makes sense behind JwtAuthGuard); target id defaults to
 * the route's `:id` param, if present.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditEventMetadata | undefined>(
      AUDIT_EVENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!metadata) {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const actorId = request.user?.sub;
    if (!actorId) {
      return next.handle();
    }

    const targetId =
      typeof request.params?.id === 'string' ? request.params.id : undefined;

    return next.handle().pipe(
      tap(() => {
        void this.auditLogService.record({
          actorId,
          action: metadata.action,
          targetType: metadata.targetType,
          targetId,
          ipAddress: request.ip,
        });
      }),
    );
  }
}
