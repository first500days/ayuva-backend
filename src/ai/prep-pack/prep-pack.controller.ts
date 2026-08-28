import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PrepPackService } from './prep-pack.service';
import { PrepPackResponseDto } from './dto/prep-pack.dto';

// MOCK implementation (TRD §6, docs/AI_INTEGRATION_CONTRACT.md)
@ApiTags('AI - Prep Pack')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('prep-pack')
export class PrepPackController {
  constructor(private readonly prepPackService: PrepPackService) {}

  @Get(':appointmentId')
  @ApiOperation({ summary: 'Get or generate the AI prep pack for an appointment (§8.4)' })
  @ApiOkResponse({ type: PrepPackResponseDto })
  get(
    @CurrentUser() user: JwtPayload,
    @Param('appointmentId') appointmentId: string,
  ): Promise<PrepPackResponseDto> {
    return this.prepPackService.get(user.sub, appointmentId);
  }
}
