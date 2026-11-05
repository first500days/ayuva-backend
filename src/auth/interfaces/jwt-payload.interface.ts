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
}
