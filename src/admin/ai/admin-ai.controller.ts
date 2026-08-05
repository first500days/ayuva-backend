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
import { AdminAiService } from './admin-ai.service';
import { QueryAiLogsDto } from './dto/query-ai-logs.dto';
import { UpdateEscalationDto } from './dto/update-escalation.dto';
import { AdminAiOverviewResponseDto } from './dto/admin-ai-overview-response.dto';
import { AdminAiLogResponseDto } from './dto/admin-ai-log-response.dto';

@ApiTags('Admin - AI Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/ai')
export class AdminAiController {
  constructor(private readonly adminAiService: AdminAiService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Platform-wide AI KPIs (FR-15.1, FR-15.2) — zeroed, not errored, with no AIInteractionLog data yet',
  })
  @ApiOkResponse({ type: AdminAiOverviewResponseDto })
  getOverview(): Promise<AdminAiOverviewResponseDto> {
    return this.adminAiService.getOverview();
  }

  @Get('logs')
  @ApiOperation({ summary: 'Live, timestamped AI interaction log (FR-15.3)' })
  @ApiOkResponse({ type: [AdminAiLogResponseDto] })
  getLogs(@Query() query: QueryAiLogsDto): Promise<AdminAiLogResponseDto[]> {
    return this.adminAiService.getLogs(query);
  }

  @Get('escalations')
  @ApiOperation({ summary: 'Flagged interactions escalation queue (FR-15.4)' })
  @ApiOkResponse({ type: [AdminAiLogResponseDto] })
  getEscalations(): Promise<AdminAiLogResponseDto[]> {
    return this.adminAiService.getEscalations();
  }

  @Patch('escalations/:id')
  @ApiOperation({
    summary:
      'Reviewer assignment/resolution on a flagged interaction, incl. mark-incorrect (FR-15.4, FR-15.5)',
  })
  @ApiOkResponse({ type: AdminAiLogResponseDto })
  updateEscalation(
    @Param('id') id: string,
    @Body() dto: UpdateEscalationDto,
  ): Promise<AdminAiLogResponseDto> {
    return this.adminAiService.updateEscalation(id, dto);
  }
}
