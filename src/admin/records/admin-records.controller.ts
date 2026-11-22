import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { AdminRecordsService } from './admin-records.service';
import { QueryAdminRecordsDto } from './dto/query-admin-records.dto';
import { AdminRecordResponseDto } from './dto/admin-record-response.dto';

@ApiTags('Admin - Medical Records')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('records')
@Controller('admin/records')
export class AdminRecordsController {
  constructor(private readonly adminRecordsService: AdminRecordsService) {}

  @Get()
  @ApiOperation({ summary: 'Medical records list (FR-5.7)' })
  @ApiOkResponse({ type: [AdminRecordResponseDto] })
  findAll(@Query() query: QueryAdminRecordsDto): Promise<AdminRecordResponseDto[]> {
    return this.adminRecordsService.findAll(query);
  }

  @Get('governance/consents')
  @ApiOperation({ summary: 'Patient consent grants and revocations' })
  getConsents() {
    return this.adminRecordsService.getConsents();
  }

  @Get('governance/access-logs')
  @ApiOperation({ summary: 'Provider record access audit logs' })
  getAccessLogs() {
    return this.adminRecordsService.getAccessLogs();
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a medical record' })
  archive(@Param('id') id: string) {
    return this.adminRecordsService.archive(id);
  }

  @Post(':id/reprocess')
  @ApiOperation({
    summary: 'Reprocess a medical record OCR/pipeline — refused (403) while the record has no consent token',
  })
  reprocess(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminRecordsService.reprocess(id, user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Single medical record detail (FR-5.7)' })
  @ApiOkResponse({ type: AdminRecordResponseDto })
  findOne(@Param('id') id: string): Promise<AdminRecordResponseDto> {
    return this.adminRecordsService.findOne(id);
  }
}
