import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import {
  AdminAnalyticsService,
  AiInteractionsPeriod,
} from './admin-analytics.service';
import {
  AdminAnalyticsOverviewResponseDto,
  AiInteractionsOverTimePointDto,
} from './dto/admin-analytics-overview-response.dto';
import { QueryAiInteractionsOverTimeDto } from './dto/query-ai-interactions-over-time.dto';

@ApiTags('Admin - Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Platform-health KPI tiles aggregated from real collections (FR-11.1-11.4)',
  })
  @ApiOkResponse({ type: AdminAnalyticsOverviewResponseDto })
  getOverview(): Promise<AdminAnalyticsOverviewResponseDto> {
    return this.adminAnalyticsService.getOverview();
  }

  @Get('ai-interactions-over-time')
  @ApiOperation({
    summary:
      'AI interactions over time, last 8 daily/weekly periods (FR-11.2)',
  })
  @ApiOkResponse({ type: [AiInteractionsOverTimePointDto] })
  getAiInteractionsOverTime(
    @Query() query: QueryAiInteractionsOverTimeDto,
  ): Promise<AiInteractionsOverTimePointDto[]> {
    return this.adminAnalyticsService.getAiInteractionsOverTime(
      (query.period as AiInteractionsPeriod) ?? 'weekly',
    );
  }

  @Get('command-center')
  @ApiOperation({
    summary: 'Live ecosystem health, priority action queue, and command center metrics',
  })
  getCommandCenter() {
    return this.adminAnalyticsService.getCommandCenterData();
  }
}
