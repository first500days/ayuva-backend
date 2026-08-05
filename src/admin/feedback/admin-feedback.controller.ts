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
import { AdminFeedbackService } from './admin-feedback.service';
import { QueryAdminFeedbackDto } from './dto/query-admin-feedback.dto';
import { UpdateFeedbackItemDto } from './dto/update-feedback-item.dto';
import { AdminFeedbackResponseDto } from './dto/admin-feedback-response.dto';
import { AdminFeedbackSummaryResponseDto } from './dto/admin-feedback-summary-response.dto';

@ApiTags('Admin - Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/feedback')
export class AdminFeedbackController {
  constructor(private readonly adminFeedbackService: AdminFeedbackService) {}

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
