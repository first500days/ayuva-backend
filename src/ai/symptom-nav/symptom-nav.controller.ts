import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { SymptomNavService } from './symptom-nav.service';
import { CreateSymptomEntryDto } from './dto/create-symptom-entry.dto';
import { SymptomNavResponseDto } from './dto/symptom-nav-response.dto';

// MOCK implementation (TRD §6, docs/AI_INTEGRATION_CONTRACT.md) — the real
// NLU + clinical rules engine is owned by a separate team.
@ApiTags('AI - Symptom Navigation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('symptom-nav')
export class SymptomNavController {
  constructor(private readonly symptomNavService: SymptomNavService) {}

  @Post('analyse')
  @ApiOperation({
    summary:
      'Submit free-text symptoms, get a mock urgency/risk/care-tier recommendation (FR-4.2, FR-4.3)',
  })
  @ApiCreatedResponse({ type: SymptomNavResponseDto })
  analyse(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSymptomEntryDto,
  ): Promise<SymptomNavResponseDto> {
    return this.symptomNavService.analyse(user.sub, dto);
  }

  @Get(':triageResultId')
  @ApiOperation({ summary: 'Retrieve a previously generated navigation result' })
  @ApiOkResponse({ type: SymptomNavResponseDto })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('triageResultId') triageResultId: string,
  ): Promise<SymptomNavResponseDto> {
    return this.symptomNavService.findOne(user.sub, triageResultId);
  }
}
