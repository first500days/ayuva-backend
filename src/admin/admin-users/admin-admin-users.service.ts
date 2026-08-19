import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminUser, AdminUserDocument, AdminUserStatus } from '../../core/admin-users/schemas/admin-user.schema';
import { QueryAdminAdminUsersDto } from './dto/query-admin-admin-users.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminAdminUserResponseDto } from './dto/admin-admin-user-response.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminAdminUsersService {
  constructor(
    @InjectModel(AdminUser.name)
    private readonly adminUserModel: Model<AdminUserDocument>,
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
    return adminUsers.map((u) => this.toResponse(u));
  }

  async findOne(id: string): Promise<AdminAdminUserResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Admin user not found');
    }
    const adminUser = await this.adminUserModel.findById(id).exec();
    if (!adminUser) {
      throw new NotFoundException('Admin user not found');
    }
    return this.toResponse(adminUser);
  }

  async create(dto: CreateAdminUserDto): Promise<AdminAdminUserResponseDto> {
    const hashedPassword = await bcrypt.hash('TempPassword123!', 10);
    const adminUser = await this.adminUserModel.create({
      email: dto.email.toLowerCase(),
      fullName: dto.fullName,
      role: dto.roleId ? new Types.ObjectId(dto.roleId) : undefined,
      permissions: dto.permissions ?? [],
      status: AdminUserStatus.ACTIVE,
      passwordHash: hashedPassword,
    });
    return this.toResponse(adminUser);
  }

  async update(id: string, dto: UpdateAdminUserDto): Promise<AdminAdminUserResponseDto> {
    const adminUser = await this.getAdminUserOrThrow(id);

    if (dto.email !== undefined) adminUser.email = dto.email.toLowerCase();
    if (dto.fullName !== undefined) adminUser.fullName = dto.fullName;
    if (dto.roleId !== undefined) adminUser.role = new Types.ObjectId(dto.roleId);
    if (dto.permissions !== undefined) adminUser.permissions = dto.permissions;
    if (dto.status !== undefined) adminUser.status = dto.status;

    await adminUser.save();
    return this.toResponse(adminUser);
  }

  async deactivate(id: string): Promise<AdminAdminUserResponseDto> {
    const adminUser = await this.getAdminUserOrThrow(id);
    adminUser.status = AdminUserStatus.INACTIVE;
    await adminUser.save();
    return this.toResponse(adminUser);
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

  private toResponse(adminUser: AdminUserDocument): AdminAdminUserResponseDto {
    return {
      id: adminUser.id,
      email: adminUser.email,
      fullName: adminUser.fullName,
      status: adminUser.status,
      roleId: adminUser.role?.toString(),
      permissions: adminUser.permissions,
      lastLoginAt: adminUser.lastLoginAt?.toISOString(),
      mfaEnabled: adminUser.mfaEnabled,
    };
  }
}
