import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '../core/users/schemas/user.schema';

/**
 * Portal isolation: the admin panel and the Partner Portal are served on their
 * own hostnames. A request that arrives on one portal's host may only act as
 * that portal's role. Hosts come from ADMIN_PORTAL_HOSTS / PARTNER_PORTAL_HOSTS
 * (comma lists). Both unset = no restriction (dev, mobile app, tests).
 */
const parse = (v?: string): string[] =>
  (v ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

export function requestHost(req: Request): string {
  const raw = (req.headers['x-forwarded-host'] ?? req.headers.host ?? '') as string;
  return raw.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}

/** The role the request's host is reserved for, or undefined for any other host. */
export function portalRoleForHost(req: Request): UserRole | undefined {
  const host = requestHost(req);
  if (!host) return undefined;
  if (parse(process.env.ADMIN_PORTAL_HOSTS).includes(host)) return UserRole.ADMIN;
  if (parse(process.env.PARTNER_PORTAL_HOSTS).includes(host)) return UserRole.PARTNER;
  return undefined;
}

export function assertPortalRole(req: Request, role: string | undefined): void {
  const required = portalRoleForHost(req);
  if (required && role !== required) {
    throw new ForbiddenException('This account cannot be used on this portal');
  }
}

/** Role claimed by an access token (payload only; the strategy verifies signatures). */
export function roleFromToken(token?: string): string | undefined {
  try {
    const body = token?.split('.')[1];
    if (!body) return undefined;
    return (JSON.parse(Buffer.from(body, 'base64url').toString()) as { role?: string }).role;
  } catch {
    return undefined;
  }
}
