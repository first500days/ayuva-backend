import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminRolesService } from './admin-roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { AdminRoleResponseDto } from './dto/admin-role-response.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@ApiTags('Admin - Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly adminRolesService: AdminRolesService) {}

  @Get()
  @ApiOperation({ summary: 'Roles list (FR-5.13)' })
  @ApiOkResponse({ type: [AdminRoleResponseDto] })
  findAll(): Promise<AdminRoleResponseDto[]> {
    return this.adminRolesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single role detail' })
  @ApiOkResponse({ type: AdminRoleResponseDto })
  findOne(@Param('id') id: string): Promise<AdminRoleResponseDto> {
    return this.adminRolesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a role (FR-5.13)' })
  @ApiCreatedResponse({ type: AdminRoleResponseDto })
  @AuditEvent(AuditAction.ADMIN_ROLE_CREATE, 'Role')
  @UseInterceptors(AuditLogInterceptor)
  create(@Body() dto: CreateRoleDto): Promise<AdminRoleResponseDto> {
    return this.adminRolesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a role (FR-5.13)' })
  @ApiOkResponse({ type: AdminRoleResponseDto })
  @AuditEvent(AuditAction.ADMIN_ROLE_UPDATE, 'Role')
  @UseInterceptors(AuditLogInterceptor)
  update(@Param('id') id: string, @Body() dto: any): Promise<AdminRoleResponseDto> {
    return this.adminRolesService.update(id, dto);
  }
}
