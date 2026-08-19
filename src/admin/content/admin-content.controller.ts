import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { AdminContentService } from './admin-content.service';
import { QueryAdminContentDto } from './dto/query-admin-content.dto';
import { CreateContentDto } from './dto/create-content.dto';
import { AdminContentResponseDto } from './dto/admin-content-response.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@ApiTags('Admin - Content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/content')
export class AdminContentController {
  constructor(private readonly adminContentService: AdminContentService) {}

  @Get()
  @ApiOperation({ summary: 'Content list (FR-5.16)' })
  @ApiOkResponse({ type: [AdminContentResponseDto] })
  findAll(@Query() query: QueryAdminContentDto): Promise<AdminContentResponseDto[]> {
    return this.adminContentService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single content detail' })
  @ApiOkResponse({ type: AdminContentResponseDto })
  findOne(@Param('id') id: string): Promise<AdminContentResponseDto> {
    return this.adminContentService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create content (FR-5.16)' })
  @ApiCreatedResponse({ type: AdminContentResponseDto })
  @AuditEvent(AuditAction.ADMIN_CONTENT_CREATE, 'Content')
  @UseInterceptors(AuditLogInterceptor)
  create(@Body() dto: CreateContentDto): Promise<AdminContentResponseDto> {
    return this.adminContentService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update content (FR-5.16)' })
  @ApiOkResponse({ type: AdminContentResponseDto })
  @AuditEvent(AuditAction.ADMIN_CONTENT_UPDATE, 'Content')
  @UseInterceptors(AuditLogInterceptor)
  update(@Param('id') id: string, @Body() dto: any): Promise<AdminContentResponseDto> {
    return this.adminContentService.update(id, dto);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publish content' })
  @ApiOkResponse({ type: AdminContentResponseDto })
  publish(@Param('id') id: string): Promise<AdminContentResponseDto> {
    return this.adminContentService.publish(id);
  }

  @Patch(':id/unpublish')
  @ApiOperation({ summary: 'Unpublish content' })
  @ApiOkResponse({ type: AdminContentResponseDto })
  unpublish(@Param('id') id: string): Promise<AdminContentResponseDto> {
    return this.adminContentService.unpublish(id);
  }
}
