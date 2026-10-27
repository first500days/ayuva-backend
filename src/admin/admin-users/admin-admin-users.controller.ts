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
import { AdminArea } from '../../common/decorators/admin-area.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminAdminUsersService } from './admin-admin-users.service';
import { QueryAdminAdminUsersDto } from './dto/query-admin-admin-users.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminAdminUserResponseDto } from './dto/admin-admin-user-response.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@ApiTags('Admin - Admin Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('admin-users')
@Controller('admin/admin-users')
export class AdminAdminUsersController {
  constructor(private readonly adminAdminUsersService: AdminAdminUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Admin user directory with MFA status (FR-5.13)' })
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
  @ApiOperation({
    summary:
      'Create an admin user with a role and a login (FR-5.13) — the temporary password is returned once',
  })
  @ApiCreatedResponse({ type: AdminAdminUserResponseDto })
  create(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminAdminUserResponseDto> {
    return this.adminAdminUsersService.create(dto, user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an admin user, incl. role and status (FR-5.13)' })
  @ApiOkResponse({ type: AdminAdminUserResponseDto })
  @AuditEvent(AuditAction.ADMIN_USER_UPDATE, 'AdminUser')
  @UseInterceptors(AuditLogInterceptor)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminAdminUserResponseDto> {
    return this.adminAdminUsersService.update(id, dto, user.sub);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate an admin user and their login (FR-5.13)' })
  @ApiOkResponse({ type: AdminAdminUserResponseDto })
  @AuditEvent(AuditAction.ADMIN_USER_STATUS_CHANGE, 'AdminUser')
  @UseInterceptors(AuditLogInterceptor)
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminAdminUserResponseDto> {
    return this.adminAdminUsersService.deactivate(id, user.sub);
  }

  @Patch(':id/reset-mfa')
  @ApiOperation({
    summary: 'Clear an admin\'s authenticator (lost phone) — they must re-enrol at next sign-in',
  })
  @ApiOkResponse({ type: AdminAdminUserResponseDto })
  resetMfa(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminAdminUserResponseDto> {
    return this.adminAdminUsersService.resetMfa(id, user.sub);
  }
}
