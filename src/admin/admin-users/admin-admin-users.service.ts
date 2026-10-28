import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { AdminUser, AdminUserDocument, AdminUserStatus } from '../../core/admin-users/schemas/admin-user.schema';
import {
  CURRENT_CONSENT_VERSION,
  User,
  UserDocument,
  UserRole,
  UserStatus,
} from '../../core/users/schemas/user.schema';
import { Role, RoleDocument } from '../../core/roles/schemas/role.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { QueryAdminAdminUsersDto } from './dto/query-admin-admin-users.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import {
  AdminAdminUserResponseDto,
  AdminMfaStatus,
} from './dto/admin-admin-user-response.dto';

/** 12 random characters with at least one letter and one digit (IsStrongPassword). */
function temporaryPassword(): string {
  const raw = randomBytes(9).toString('base64url');
  return /\d/.test(raw) && /[A-Za-z]/.test(raw) ? raw : `${raw.slice(0, 10)}a7`;
}

const LOGIN_STATUS_FOR: Record<AdminUserStatus, UserStatus> = {
  [AdminUserStatus.ACTIVE]: UserStatus.ACTIVE,
  [AdminUserStatus.INACTIVE]: UserStatus.INACTIVE,
  [AdminUserStatus.SUSPENDED]: UserStatus.INACTIVE,
};

@Injectable()
export class AdminAdminUsersService {
  constructor(
    @InjectModel(AdminUser.name)
    private readonly adminUserModel: Model<AdminUserDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(query: QueryAdminAdminUsersDto): Promise<AdminAdminUserResponseDto[]> {
    const filter: any = {};

    if (query.search) {
      filter.$or = [
        { email: { $regex: query.search, $options: 'i' } },
        { fullName: { $regex: query.search, $options: 'i' } },
      ];
    }
    if (query.status) filter.status = query.status;

    const adminUsers = await this.adminUserModel.find(filter).sort({ createdAt: -1 }).exec();
    return this.toResponses(adminUsers);
  }

  async findOne(id: string): Promise<AdminAdminUserResponseDto> {
    const adminUser = await this.getAdminUserOrThrow(id);
    return (await this.toResponses([adminUser]))[0];
  }

  /**
   * Adds a staff member: a directory entry with a role, plus the admin login
   * they sign in with. A new login gets a one-time temporary password,
   * returned only in this response; MFA enrolment is forced at first sign-in.
   */
  async create(dto: CreateAdminUserDto, actorId: string): Promise<AdminAdminUserResponseDto> {
    const email = dto.email.toLowerCase().trim();
    await this.getRoleOrThrow(dto.roleId);
    if (await this.adminUserModel.exists({ email })) {
      throw new ConflictException('An admin user with this email already exists');
    }

    let login = await this.userModel.findOne({ email }).exec();
    let password: string | undefined;
    if (login && login.role !== UserRole.ADMIN) {
      throw new ConflictException(
        `This email belongs to a ${login.role} account and can't be made an admin`,
      );
    }
    if (!login) {
      password = temporaryPassword();
      login = await this.userModel.create({
        fullName: dto.fullName,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        // Required by the schema; patient consent flows don't apply to staff accounts.
        consent: {
          termsAccepted: true,
          privacyAccepted: true,
          healthDataProcessingAccepted: false,
          version: CURRENT_CONSENT_VERSION,
          acceptedAt: new Date(),
        },
      });
    }

    const adminUser = await this.adminUserModel.create({
      userId: login._id,
      email,
      fullName: dto.fullName,
      role: new Types.ObjectId(dto.roleId),
      permissions: dto.permissions ?? [],
      status: AdminUserStatus.ACTIVE,
    });
    await this.auditLogService.record({
      actorId,
      action: AuditAction.ADMIN_USER_CREATE,
      targetType: 'AdminUser',
      targetId: adminUser.id,
      metadata: { email, roleId: dto.roleId, newLogin: !!password },
    });
    const [response] = await this.toResponses([adminUser]);
    return { ...response, temporaryPassword: password };
  }

  async update(id: string, dto: UpdateAdminUserDto): Promise<AdminAdminUserResponseDto> {
    const adminUser = await this.getAdminUserOrThrow(id);

    if (dto.email !== undefined) adminUser.email = dto.email.toLowerCase();
    if (dto.fullName !== undefined) adminUser.fullName = dto.fullName;
    if (dto.roleId !== undefined) {
      await this.getRoleOrThrow(dto.roleId);
      adminUser.role = new Types.ObjectId(dto.roleId);
    }
    if (dto.permissions !== undefined) adminUser.permissions = dto.permissions;
    if (dto.status !== undefined) {
      adminUser.status = dto.status;
      await this.syncLoginStatus(adminUser);
    }

    await adminUser.save();
    return this.findOne(adminUser.id);
  }

  async deactivate(id: string): Promise<AdminAdminUserResponseDto> {
    const adminUser = await this.getAdminUserOrThrow(id);
    adminUser.status = AdminUserStatus.INACTIVE;
    await adminUser.save();
    // A deactivated admin can no longer sign in, and their refresh token stops working.
    await this.syncLoginStatus(adminUser);
    return this.findOne(adminUser.id);
  }

  /**
   * For a lost or replaced phone: removes the authenticator secret, so the
   * admin must set MFA up again at their next sign-in. MFA stays mandatory.
   */
  async resetMfa(id: string, actorId: string): Promise<AdminAdminUserResponseDto> {
    const adminUser = await this.getAdminUserOrThrow(id);
    const login = await this.loginFor(adminUser);
    if (!login) {
      throw new BadRequestException('This admin user has no login account yet');
    }
    await this.userModel.updateOne(
      { _id: login._id },
      { $set: { mfa: { enabled: false, failedAttempts: 0 } } },
    );
    await this.auditLogService.record({
      actorId,
      action: AuditAction.ADMIN_MFA_RESET,
      targetType: 'AdminUser',
      targetId: adminUser.id,
      metadata: { email: adminUser.email },
    });
    return this.findOne(adminUser.id);
  }

  private async syncLoginStatus(adminUser: AdminUserDocument): Promise<void> {
    const login = await this.loginFor(adminUser);
    if (!login) return;
    await this.userModel.updateOne(
      { _id: login._id },
      { $set: { status: LOGIN_STATUS_FOR[adminUser.status] } },
    );
  }

  private loginFor(adminUser: AdminUserDocument) {
    return this.userModel
      .findOne({
        role: UserRole.ADMIN,
        $or: [
          ...(adminUser.userId ? [{ _id: adminUser.userId }] : []),
          { email: adminUser.email },
        ],
      })
      .exec();
  }

  private async getRoleOrThrow(roleId: string | undefined): Promise<RoleDocument> {
    const role =
      roleId && Types.ObjectId.isValid(roleId) ? await this.roleModel.findById(roleId).exec() : null;
    if (!role) throw new BadRequestException('Choose a valid role for this admin user');
    return role;
  }

  private async getAdminUserOrThrow(id: string): Promise<AdminUserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Admin user not found');
    }
    const adminUser = await this.adminUserModel.findById(id).exec();
    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }
    return adminUser;
  }

  /** Joins each entry to its login (MFA status) and role (name). */
  private async toResponses(adminUsers: AdminUserDocument[]): Promise<AdminAdminUserResponseDto[]> {
    if (adminUsers.length === 0) return [];
    const present = (id: Types.ObjectId | undefined): id is Types.ObjectId => !!id;
    const [logins, roles] = await Promise.all([
      this.userModel
        .find({
          role: UserRole.ADMIN,
          $or: [
            { _id: { $in: adminUsers.map((u) => u.userId).filter(present) } },
            { email: { $in: adminUsers.map((u) => u.email) } },
          ],
        })
        .select('email mfa')
        .lean()
        .exec(),
      this.roleModel
        .find({ _id: { $in: adminUsers.map((u) => u.role).filter(present) } })
        .select('name')
        .lean()
        .exec(),
    ]);
    const loginById = new Map(logins.map((l) => [l._id.toString(), l]));
    const loginByEmail = new Map(logins.map((l) => [l.email, l]));
    const roleNameById = new Map(roles.map((r) => [r._id.toString(), r.name]));

    return adminUsers.map((adminUser) => {
      const login =
        (adminUser.userId && loginById.get(adminUser.userId.toString())) ||
        loginByEmail.get(adminUser.email);
      const mfaStatus: AdminMfaStatus = !login
        ? 'no_login'
        : login.mfa?.enabled
          ? 'enrolled'
          : 'pending_enrollment';
      return {
        id: adminUser.id,
        email: adminUser.email,
        fullName: adminUser.fullName,
        status: adminUser.status,
        roleId: adminUser.role?.toString(),
        roleName: adminUser.role ? roleNameById.get(adminUser.role.toString()) : undefined,
        permissions: adminUser.permissions,
        lastLoginAt: adminUser.lastLoginAt?.toISOString(),
        mfaEnabled: mfaStatus === 'enrolled',
        mfaStatus,
        mfaEnrolledAt: login?.mfa?.enrolledAt?.toISOString(),
      };
    });
  }
}
