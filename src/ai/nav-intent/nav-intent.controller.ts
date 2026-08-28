import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { NavIntentService } from './nav-intent.service';
import { AnalyseNavIntentDto, NavIntentResponseDto } from './dto/nav-intent.dto';

// MOCK implementation (TRD §6, docs/AI_INTEGRATION_CONTRACT.md) — keyword
// classifier standing in for real NLU.
@ApiTags('AI - Navigation Intent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('nav-intent')
export class NavIntentController {
  constructor(private readonly navIntentService: NavIntentService) {}

  @Post('analyse')
  @ApiOperation({ summary: 'Convert free-text query into navigation actions and filters (§2.3, FR-5.1)' })
  @ApiCreatedResponse({ type: NavIntentResponseDto })
  analyse(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AnalyseNavIntentDto,
  ): Promise<NavIntentResponseDto> {
    return this.navIntentService.analyse(user.sub, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a previously generated nav intent result' })
  @ApiOkResponse({ type: NavIntentResponseDto })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<NavIntentResponseDto> {
    return this.navIntentService.findOne(user.sub, id);
  }
}
