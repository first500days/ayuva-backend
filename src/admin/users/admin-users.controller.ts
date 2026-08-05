import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminUsersService } from './admin-users.service';
import { QueryAdminUsersDto } from './dto/query-admin-users.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AdminUserResponseDto } from './dto/admin-user-response.dto';
import { AdminUserActivityItemDto } from './dto/admin-user-activity-item.dto';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Searchable, filterable patient table (FR-12.1)',
  })
  @ApiOkResponse({ type: [AdminUserResponseDto] })
  findAll(@Query() query: QueryAdminUsersDto): Promise<AdminUserResponseDto[]> {
    return this.adminUsersService.findAll(query);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate/deactivate a patient account (FR-12.2)' })
  @ApiOkResponse({ type: AdminUserResponseDto })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<AdminUserResponseDto> {
    return this.adminUsersService.updateStatus(id, dto);
  }

  @Get(':id/activity')
  @ApiOperation({
    summary:
      'Chronological activity history: appointments, medication logs, records (FR-12.3)',
  })
  @ApiOkResponse({ type: [AdminUserActivityItemDto] })
  getActivityHistory(
    @Param('id') id: string,
  ): Promise<AdminUserActivityItemDto[]> {
    return this.adminUsersService.getActivityHistory(id);
  }
}
