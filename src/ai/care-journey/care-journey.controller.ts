import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CareJourneyService } from './care-journey.service';
import { GenerateCareJourneyDto } from './dto/generate-care-journey.dto';
import { UpdateCareStepDto } from './dto/update-care-step.dto';
import { CareJourneyResponseDto } from './dto/care-journey-response.dto';

// MOCK pathway generation (TRD §6, docs/AI_INTEGRATION_CONTRACT.md); step
// progress updates below are real persisted state, not AI output.
@ApiTags('AI - Care Journey')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('care-journey')
export class CareJourneyController {
  constructor(private readonly careJourneyService: CareJourneyService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate a mock care journey from a triage result (FR-5.1, FR-5.2)',
  })
  @ApiCreatedResponse({ type: CareJourneyResponseDto })
  generate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateCareJourneyDto,
  ): Promise<CareJourneyResponseDto> {
    return this.careJourneyService.generate(user.sub, dto);
  }

  @Get('active')
  @ApiOperation({ summary: "Current user's active care journey, if any" })
  @ApiOkResponse({ type: CareJourneyResponseDto })
  findActive(@CurrentUser() user: JwtPayload): Promise<CareJourneyResponseDto> {
    return this.careJourneyService.findActive(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a care journey by id' })
  @ApiOkResponse({ type: CareJourneyResponseDto })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<CareJourneyResponseDto> {
    return this.careJourneyService.findOne(user.sub, id);
  }

  @Patch(':id/steps')
  @ApiOperation({
    summary: 'Update a step\'s status (progress tracking, FR-5.4)',
  })
  @ApiOkResponse({ type: CareJourneyResponseDto })
  updateStep(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCareStepDto,
  ): Promise<CareJourneyResponseDto> {
    return this.careJourneyService.updateStep(user.sub, id, dto);
  }
}
