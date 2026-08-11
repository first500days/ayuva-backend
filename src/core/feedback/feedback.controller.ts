import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { FeedbackService } from './feedback.service';
import { CreateFeedbackItemDto } from './dto/create-feedback-item.dto';
import { FeedbackItemResponseDto } from './dto/feedback-item-response.dto';

@ApiTags('Feedback')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @ApiOperation({
    summary:
      'Submit feedback/feature request/support/bug report, optionally with a CSAT rating (Module 17, FR-17.2)',
  })
  @ApiCreatedResponse({ type: FeedbackItemResponseDto })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateFeedbackItemDto,
  ): Promise<FeedbackItemResponseDto> {
    return this.feedbackService.create(user.sub, dto);
  }
}
