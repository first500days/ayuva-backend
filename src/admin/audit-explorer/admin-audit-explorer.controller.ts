import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminArea } from '../../common/decorators/admin-area.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminAuditExplorerService } from './admin-audit-explorer.service';
import type { AuditExplorerQuery } from './admin-audit-explorer.service';
import { AuditSealService } from '../../audit-log/audit-seal.service';

class TerminateSessionsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

@Controller('admin/audit-explorer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('audit-explorer')
export class AdminAuditExplorerController {
  constructor(
    private readonly auditExplorerService: AdminAuditExplorerService,
    private readonly seals: AuditSealService,
  ) {}

  /** Re-checks every sealed log row against its tamper-evident seal. */
  @Get('verify')
  async verify() {
    return this.seals.verify();
  }

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

  /** "Terminate web tokens": ends every session of this login at once. */
  @Post('actors/:userId/terminate-sessions')
  async terminateSessions(
    @CurrentUser() admin: JwtPayload,
    @Param('userId') userId: string,
    @Body() dto: TerminateSessionsDto,
  ) {
    return this.auditExplorerService.terminateSessions(
      admin.sub,
      userId,
      dto.reason,
    );
  }
}
