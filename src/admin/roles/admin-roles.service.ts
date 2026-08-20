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
    let roles = await this.roleModel.find().sort({ name: 1 }).exec();
    if (roles.length === 0) {
      const canonicalRoles = [
        {
          name: 'Founder',
          description: 'Restricted executive workspace for company governance, confidential strategy, investor relations and board oversight.',
          permissions: ['founder:read', 'founder:write', 'founder:vault_access', 'audit:read', 'analytics:read', 'finance:read'],
          isSystem: true,
        },
        {
          name: 'Super Admin',
          description: 'Full ecosystem administration across clinical network, AI models, website studio, users and financial systems.',
          permissions: ['*'],
          isSystem: true,
        },
        {
          name: 'Operations Admin',
          description: 'Unified cross-system issue resolution, incident management, exception handling, and service reconciliation.',
          permissions: ['operations:read', 'operations:write', 'operations:resolve', 'appointments:write', 'records:write', 'integrations:sync'],
          isSystem: true,
        },
        {
          name: 'Network Admin',
          description: 'Hospital, clinic, doctor, and diagnostic laboratory lifecycle onboarding, verification, and catalogue mapping.',
          permissions: ['hospitals:read', 'hospitals:write', 'providers:read', 'providers:write', 'labs:read', 'labs:write', 'marketplace:manage'],
          isSystem: true,
        },
        {
          name: 'Support Admin',
          description: 'Individual user application support, account recovery, care journey assistance, and communication triage.',
          permissions: ['users:read', 'users:manage', 'appointments:read', 'feedback:manage', 'records:metadata_read'],
          isSystem: true,
        },
        {
          name: 'AI Operations',
          description: 'AI model instructions, tool permissions, safety guardrails, knowledge sources, and prompt release versioning.',
          permissions: ['ai:read', 'ai:configure', 'ai:tools_manage', 'ai:releases_publish', 'ai:review_manage'],
          isSystem: true,
        },
        {
          name: 'Content Admin',
          description: 'Website Studio CMS page editor, announcements, hero sections, media library, and publication rollback.',
          permissions: ['content:read', 'content:write', 'content:publish', 'content:rollback'],
          isSystem: true,
        },
        {
          name: 'Growth Admin',
          description: 'Advertising campaigns, sponsored placement scheduling, creative review, and attributable growth analytics.',
          permissions: ['growth:read', 'growth:create', 'growth:edit', 'growth:approve', 'analytics:read'],
          isSystem: true,
        },
        {
          name: 'Finance Admin',
          description: 'Marketplace billing, transactions, provider/lab invoices, batch settlements, and manual adjustments.',
          permissions: ['payments:read', 'payments:refund', 'payments:settle', 'payments:adjust', 'invoices:manage', 'audit:finance_read'],
          isSystem: true,
        },
        {
          name: 'Auditor',
          description: 'Independent compliance, data privacy review, and read-only searchable audit explorer access.',
          permissions: ['audit:read', 'audit:export', 'records:access_audit', 'reports:read', 'analytics:read'],
          isSystem: true,
        },
      ];
      await this.roleModel.insertMany(canonicalRoles);
      roles = await this.roleModel.find().sort({ name: 1 }).exec();
    }
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
