import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '../schemas/audit-log.schema';

export const AUDIT_EVENT_KEY = 'auditEvent';

export interface AuditEventMetadata {
  action: AuditAction;
  targetType: string;
}

/** Marks a route handler for automatic audit logging by AuditLogInterceptor. */
export const AuditEvent = (action: AuditAction, targetType: string) =>
  SetMetadata(AUDIT_EVENT_KEY, { action, targetType } as AuditEventMetadata);
