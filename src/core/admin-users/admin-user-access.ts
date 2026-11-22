import { AdminUserStatus } from './schemas/admin-user.schema';

/**
 * Whether a directory entry's status lets the admin in. Entries inserted
 * outside the app may hold "active" in lower case; only an actual
 * deactivation (Inactive / Suspended) locks an admin out.
 */
export const isActiveAdminStatus = (status: unknown): boolean =>
  status === undefined ||
  status === null ||
  (typeof status === 'string' &&
    status.toUpperCase() === String(AdminUserStatus.ACTIVE));

/**
 * Full access, as AdminAccessService grants it: no role or extra permissions
 * at all (entries from before role assignment), or '*'.
 */
export const hasFullAdminAccess = (
  rolePermissions: string[] | undefined,
  permissions: string[] | undefined,
): boolean => {
  const all = [...(rolePermissions ?? []), ...(permissions ?? [])];
  return all.length === 0 || all.includes('*');
};
