import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
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
import { AdminArea } from '../../common/decorators/admin-area.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminFeedbackService } from './admin-feedback.service';
import { AdminFeedbackComplianceService } from './admin-feedback-compliance.service';
import { QueryAdminFeedbackDto } from './dto/query-admin-feedback.dto';
import { UpdateFeedbackItemDto } from './dto/update-feedback-item.dto';
import { AdminFeedbackResponseDto } from './dto/admin-feedback-response.dto';
import { AdminFeedbackSummaryResponseDto } from './dto/admin-feedback-summary-response.dto';
import {
  EscalateComplianceDto,
  FeedbackAiContextItemDto,
} from './dto/compliance-escalation.dto';

@ApiTags('Admin - Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('feedback')
@Controller('admin/feedback')
export class AdminFeedbackController {
  constructor(
    private readonly adminFeedbackService: AdminFeedbackService,
    private readonly compliance: AdminFeedbackComplianceService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Unified feedback/feature-request/support/bug queue (FR-17.1-17.3)',
  })
  @ApiOkResponse({ type: [AdminFeedbackResponseDto] })
  findAll(
    @Query() query: QueryAdminFeedbackDto,
  ): Promise<AdminFeedbackResponseDto[]> {
    return this.adminFeedbackService.findAll(query);
  }

  @Get('summary')
  @ApiOperation({
    summary:
      'Summary tiles: open count, feature requests, bug reports, average CSAT (FR-17.2)',
  })
  @ApiOkResponse({ type: AdminFeedbackSummaryResponseDto })
  getSummary(): Promise<AdminFeedbackSummaryResponseDto> {
    return this.adminFeedbackService.getSummary();
  }

  @Get(':id/ai-context')
  @ApiOperation({
    summary:
      "The reporter's recent AI outputs and the prompt version behind each (for a compliance escalation)",
  })
  @ApiOkResponse({ type: [FeedbackAiContextItemDto] })
  aiContext(@Param('id') id: string): Promise<FeedbackAiContextItemDto[]> {
    return this.compliance.aiContext(id);
  }

  @Post(':id/escalate-compliance')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Escalate to the legal and medical risk teams: logs the exact prompt version, opens a critical incident and pauses the prompt for similar documents',
  })
  @ApiOkResponse({ type: AdminFeedbackResponseDto })
  escalateCompliance(
    @Param('id') id: string,
    @Body() dto: EscalateComplianceDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AdminFeedbackResponseDto> {
    return this.compliance.escalate(id, dto, { id: user.sub, email: user.email });
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update status/ownership on a feedback item (FR-17.4)',
  })
  @ApiOkResponse({ type: AdminFeedbackResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackItemDto,
  ): Promise<AdminFeedbackResponseDto> {
    return this.adminFeedbackService.update(id, dto);
  }
}
