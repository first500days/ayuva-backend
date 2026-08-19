import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from '../../core/roles/schemas/role.schema';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AdminRoleResponseDto } from './dto/admin-role-response.dto';

@Injectable()
export class AdminRolesService {
  constructor(
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
  ) {}

  async findAll(): Promise<AdminRoleResponseDto[]> {
    const roles = await this.roleModel.find().sort({ name: 1 }).exec();
    return roles.map((r) => this.toResponse(r));
  }

  async findOne(id: string): Promise<AdminRoleResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Role not found');
    }
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return this.toResponse(role);
  }

  async create(dto: CreateRoleDto): Promise<AdminRoleResponseDto> {
    const role = await this.roleModel.create({
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions ?? [],
      isSystem: false,
    });
    return this.toResponse(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<AdminRoleResponseDto> {
    const role = await this.getRoleOrThrow(id);

    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.permissions !== undefined) role.permissions = dto.permissions;

    await role.save();
    return this.toResponse(role);
  }

  private async getRoleOrThrow(id: string): Promise<RoleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Role not found');
    }
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  private toResponse(role: RoleDocument): AdminRoleResponseDto {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystem: role.isSystem,
    };
  }
}
