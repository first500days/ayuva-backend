import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { AdminAdminUsersService } from './admin-admin-users.service';
import { QueryAdminAdminUsersDto } from './dto/query-admin-admin-users.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { AdminAdminUserResponseDto } from './dto/admin-admin-user-response.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@ApiTags('Admin - Admin Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/admin-users')
export class AdminAdminUsersController {
  constructor(private readonly adminAdminUsersService: AdminAdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Admin user directory (FR-5.13)' })
  @ApiOkResponse({ type: [AdminAdminUserResponseDto] })
  findAll(@Query() query: QueryAdminAdminUsersDto): Promise<AdminAdminUserResponseDto[]> {
    return this.adminAdminUsersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single admin user detail' })
  @ApiOkResponse({ type: AdminAdminUserResponseDto })
  findOne(@Param('id') id: string): Promise<AdminAdminUserResponseDto> {
    return this.adminAdminUsersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an admin user (FR-5.13)' })
  @ApiCreatedResponse({ type: AdminAdminUserResponseDto })
  @AuditEvent(AuditAction.ADMIN_USER_CREATE, 'AdminUser')
  @UseInterceptors(AuditLogInterceptor)
  create(@Body() dto: CreateAdminUserDto): Promise<AdminAdminUserResponseDto> {
    return this.adminAdminUsersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an admin user (FR-5.13)' })
  @ApiOkResponse({ type: AdminAdminUserResponseDto })
  @AuditEvent(AuditAction.ADMIN_USER_UPDATE, 'AdminUser')
  @UseInterceptors(AuditLogInterceptor)
  update(@Param('id') id: string, @Body() dto: any): Promise<AdminAdminUserResponseDto> {
    return this.adminAdminUsersService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an admin user (FR-5.13)' })
  @ApiOkResponse({ type: AdminAdminUserResponseDto })
  deactivate(@Param('id') id: string): Promise<AdminAdminUserResponseDto> {
    return this.adminAdminUsersService.deactivate(id);
  }
}
