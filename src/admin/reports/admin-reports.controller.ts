import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { AdminReportsService } from './admin-reports.service';
import { QueryAdminReportsDto } from './dto/query-admin-reports.dto';
import { AdminReportResponseDto } from './dto/admin-report-response.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@ApiTags('Admin - Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Report queue joining MedicalRecord + ReportInterpretation, filterable by status/type (FR-16.1)',
  })
  @ApiOkResponse({ type: [AdminReportResponseDto] })
  findAll(
    @Query() query: QueryAdminReportsDto,
  ): Promise<AdminReportResponseDto[]> {
    return this.adminReportsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Single report detail — MedicalRecord + its AI interpretation, if any (FR-16.2)',
  })
  @ApiOkResponse({ type: AdminReportResponseDto })
  findOne(@Param('id') id: string): Promise<AdminReportResponseDto> {
    return this.adminReportsService.findOne(id);
  }

  @Get(':id/file')
  @ApiOperation({
    summary: 'Stream the decrypted source file for a report (FR-16.2)',
  })
  @AuditEvent(AuditAction.RECORD_DOWNLOAD, 'MedicalRecord')
  @UseInterceptors(AuditLogInterceptor)
  async getFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    const { buffer, contentType } = await this.adminReportsService.getFile(id);
    res.setHeader('Content-Type', contentType);
    return buffer;
  }
}
