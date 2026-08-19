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
import { AdminLabsService } from './admin-labs.service';
import { QueryAdminLabsDto } from './dto/query-admin-labs.dto';
import { CreateLabDto } from './dto/create-lab.dto';
import { UpdateLabDto } from './dto/update-lab.dto';
import { AdminLabResponseDto } from './dto/admin-lab-response.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@ApiTags('Admin - Labs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/labs')
export class AdminLabsController {
  constructor(private readonly adminLabsService: AdminLabsService) {}

  @Get()
  @ApiOperation({ summary: 'Diagnostic lab directory (FR-5.5)' })
  @ApiOkResponse({ type: [AdminLabResponseDto] })
  findAll(@Query() query: QueryAdminLabsDto): Promise<AdminLabResponseDto[]> {
    return this.adminLabsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single lab detail' })
  @ApiOkResponse({ type: AdminLabResponseDto })
  findOne(@Param('id') id: string): Promise<AdminLabResponseDto> {
    return this.adminLabsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add a diagnostic lab (FR-5.5)' })
  @ApiCreatedResponse({ type: AdminLabResponseDto })
  @AuditEvent(AuditAction.ADMIN_LAB_CREATE, 'Lab')
  @UseInterceptors(AuditLogInterceptor)
  create(@Body() dto: CreateLabDto): Promise<AdminLabResponseDto> {
    return this.adminLabsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a diagnostic lab (FR-5.5)' })
  @ApiOkResponse({ type: AdminLabResponseDto })
  @AuditEvent(AuditAction.ADMIN_LAB_UPDATE, 'Lab')
  @UseInterceptors(AuditLogInterceptor)
  update(@Param('id') id: string, @Body() dto: UpdateLabDto): Promise<AdminLabResponseDto> {
    return this.adminLabsService.update(id, dto);
  }

  @Patch(':id/verify')
  @ApiOperation({ summary: 'Verify a diagnostic lab' })
  @ApiOkResponse({ type: AdminLabResponseDto })
  verify(@Param('id') id: string): Promise<AdminLabResponseDto> {
    return this.adminLabsService.verify(id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a diagnostic lab' })
  @ApiOkResponse({ type: AdminLabResponseDto })
  reject(@Param('id') id: string): Promise<AdminLabResponseDto> {
    return this.adminLabsService.reject(id);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a diagnostic lab' })
  @ApiOkResponse({ type: AdminLabResponseDto })
  suspend(@Param('id') id: string): Promise<AdminLabResponseDto> {
    return this.adminLabsService.suspend(id);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a diagnostic lab' })
  @ApiOkResponse({ type: AdminLabResponseDto })
  activate(@Param('id') id: string): Promise<AdminLabResponseDto> {
    return this.adminLabsService.activate(id);
  }
}
