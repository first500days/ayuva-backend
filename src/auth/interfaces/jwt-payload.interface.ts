import { UserRole } from '../../core/users/schemas/user.schema';

/** Claims carried by the access token issued at login/register (Phase 2). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  // Admin tokens only: issued after the authenticator-app second factor.
  mfa?: boolean;
  // Admin tokens only: permissions from the admin's role (see common/admin-modules.ts).
  perms?: string[];
  // Set while a guardian acts for a family member: `sub` is the member, this is the guardian.
  guardian?: string;
  // Partner Portal tokens only: which sign-in this belongs to. A newer sign-in replaces it.
  sid?: string;
}

/** Starts the 401 message when a newer sign-in has replaced this session. */
export const SESSION_REPLACED = 'SESSION_REPLACED';
/** Error prefix when a Partner Portal session ended after 10 minutes without activity. */
export const SESSION_IDLE = 'SESSION_IDLE';

/** Clinical portals sign out after this long with no keyboard, mouse or touch activity. */
export const PARTNER_IDLE_SIGNOUT_MS = 10 * 60_000;
/** The portal reports activity at most once a minute; allow for that before refusing. */
export const PARTNER_IDLE_GRACE_MS = 75_000;

/** True when the session has gone longer than the idle limit without reported activity. */
export function partnerIdleExpired(
  activeAt: Date | undefined | null,
  now = Date.now(),
): boolean {
  return (
    !!activeAt &&
    now - activeAt.getTime() > PARTNER_IDLE_SIGNOUT_MS + PARTNER_IDLE_GRACE_MS
  );
}

/** Error prefix while Ayuva has locked the whole partner organisation. */
export const FACILITY_LOCKED = 'FACILITY_LOCKED';
