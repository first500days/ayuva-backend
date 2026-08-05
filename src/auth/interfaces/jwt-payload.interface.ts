import { UserRole } from '../../core/users/schemas/user.schema';

/** Claims carried by the access token issued at login/register (Phase 2). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}
