import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
import { ReportInterpreterService } from './report-interpreter.service';
import { AnalyseReportDto } from './dto/analyse-report.dto';
import { ReportInterpretationResponseDto } from './dto/report-interpretation-response.dto';

// MOCK implementation (TRD §6, docs/AI_INTEGRATION_CONTRACT.md) — the real
// document-understanding model is owned by a separate team.
@ApiTags('AI - Report Interpreter')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('report-interpreter')
export class ReportInterpreterController {
  constructor(private readonly reportInterpreterService: ReportInterpreterService) {}

  @Post('analyse')
  @ApiOperation({
    summary:
      'Interpret an uploaded medical record into plain language (FR-9.1-9.4)',
  })
  @ApiCreatedResponse({ type: ReportInterpretationResponseDto })
  analyse(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AnalyseReportDto,
  ): Promise<ReportInterpretationResponseDto> {
    return this.reportInterpreterService.analyse(user.sub, dto);
  }

  @Get(':recordId')
  @ApiOperation({ summary: 'Retrieve an existing interpretation for a record' })
  @ApiOkResponse({ type: ReportInterpretationResponseDto })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('recordId') recordId: string,
  ): Promise<ReportInterpretationResponseDto> {
    return this.reportInterpreterService.findOne(user.sub, recordId);
  }
}
