import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminAuditExplorerService } from './admin-audit-explorer.service';
import type { AuditExplorerQuery } from './admin-audit-explorer.service';

@Controller('admin/audit-explorer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAuditExplorerController {
  constructor(private readonly auditExplorerService: AdminAuditExplorerService) {}

  @Get()
  async findAll(@Query() query: AuditExplorerQuery) {
    return this.auditExplorerService.findAll(query);
  }

  @Get('summary')
  async getSummary() {
    return this.auditExplorerService.getSummary();
  }

  @Get('export')
  async exportLogs(@Query() query: AuditExplorerQuery) {
    return this.auditExplorerService.exportLogs(query);
  }
}
