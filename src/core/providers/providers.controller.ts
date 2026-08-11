import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ProvidersService } from './providers.service';
import { QueryProvidersDto } from './dto/query-providers.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { AppointmentSlotResponseDto } from './dto/appointment-slot-response.dto';

@ApiTags('Providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @ApiOperation({ summary: 'Search/filter/sort providers (FR-6.1-6.3)' })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  findAll(
    @Query() query: QueryProvidersDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProviderResponseDto[]> {
    return this.providersService.findAll(query, user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Provider profile detail (FR-6.4)' })
  @ApiOkResponse({ type: ProviderResponseDto })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProviderResponseDto> {
    return this.providersService.findOne(id, user.sub);
  }

  @Post(':id/save')
  @ApiOperation({ summary: 'Toggle save/bookmark for a provider (FR-6.5)' })
  @ApiOkResponse({ schema: { properties: { saved: { type: 'boolean' } } } })
  toggleSave(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ saved: boolean }> {
    return this.providersService.toggleSave(id, user.sub);
  }

  @Get(':id/slots')
  @ApiOperation({
    summary: "Provider's bookable slots for a given date (FR-7.2)",
  })
  @ApiParam({ name: 'id', description: 'Provider id' })
  @ApiQuery({
    name: 'date',
    example: '2026-08-14',
    description: 'ISO date (YYYY-MM-DD)',
  })
  @ApiOkResponse({ type: [AppointmentSlotResponseDto] })
  getSlots(
    @Param('id') id: string,
    @Query('date') date: string,
  ): Promise<AppointmentSlotResponseDto[]> {
    return this.providersService.getSlots(id, date);
  }
}
