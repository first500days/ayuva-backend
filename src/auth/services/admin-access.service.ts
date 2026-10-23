import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AdminUser,
  AdminUserDocument,
  AdminUserStatus,
} from '../../core/admin-users/schemas/admin-user.schema';
import { Role, RoleDocument } from '../../core/roles/schemas/role.schema';
import { allowedAdminModules, AdminModuleKey } from '../../common/admin-modules';

export interface AdminAccess {
  permissions: string[];
  roleName: string;
  modules: AdminModuleKey[];
  // The Admin Users directory entry, when the login has one.
  directoryId: string | null;
  active: boolean;
}

/**
 * What a signed-in admin may open, from the Admin Users directory entry
 * linked to their login (by user id, else by email) and its role. Logins with
 * no entry — or an entry never given a role or permissions — predate role
 * assignment and keep full access until a Super Admin assigns one.
 */
@Injectable()
export class AdminAccessService {
  constructor(
    @InjectModel(AdminUser.name)
    private readonly adminUserModel: Model<AdminUserDocument>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
  ) {}

  async resolve(user: { id: string; email: string }): Promise<AdminAccess> {
    const entry = await this.adminUserModel
      .findOne({
        $or: [
          { userId: new Types.ObjectId(user.id) },
          { email: user.email.toLowerCase() },
        ],
      })
      .exec();
    if (!entry) return this.fullAccess('Super Admin', null, true);

    const role = entry.role
      ? await this.roleModel.findById(entry.role).lean().exec()
      : null;
    const active = entry.status === AdminUserStatus.ACTIVE;
    const permissions = [
      ...new Set([...(role?.permissions ?? []), ...(entry.permissions ?? [])]),
    ];
    if (permissions.length === 0) {
      return this.fullAccess('Unassigned (full access)', entry.id, active);
    }
    return {
      permissions,
      roleName: role?.name ?? 'Custom access',
      modules: allowedAdminModules(permissions),
      directoryId: entry.id,
      active,
    };
  }

  /** Stamps "Last Login" on the directory entry (Admin Users screen). */
  async recordLogin(directoryId: string | null, userId: string): Promise<void> {
    if (!directoryId) return;
    await this.adminUserModel
      .updateOne(
        { _id: directoryId },
        { $set: { lastLoginAt: new Date(), userId: new Types.ObjectId(userId) } },
      )
      .exec();
  }

  private fullAccess(roleName: string, directoryId: string | null, active: boolean): AdminAccess {
    return {
      permissions: ['*'],
      roleName,
      modules: allowedAdminModules(['*']),
      directoryId,
      active,
    };
  }
}
