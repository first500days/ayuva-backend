import { SetMetadata } from '@nestjs/common';
import type { AdminModuleKey } from '../admin-modules';

export const ADMIN_AREAS_KEY = 'adminAreas';

/**
 * The Admin Panel module(s) a controller serves. RolesGuard lets an admin
 * through only if their role opens at least one of them; without this
 * decorator any admin may call the route.
 */
export const AdminArea = (...modules: AdminModuleKey[]) => SetMetadata(ADMIN_AREAS_KEY, modules);
