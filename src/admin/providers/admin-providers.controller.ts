import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminProvidersService } from './admin-providers.service';
import { QueryAdminProvidersDto } from './dto/query-admin-providers.dto';
import { AdminCreateProviderDto } from './dto/admin-create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProviderScheduleDto } from './dto/provider-schedule.dto';
import { BlockedDateDto } from './dto/blocked-date.dto';
import { AdminProviderResponseDto } from './dto/admin-provider-response.dto';

@ApiTags('Admin - Providers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private readonly adminProvidersService: AdminProvidersService) {}

  @Get()
  @ApiOperation({
    summary:
      'Provider directory, searchable/filterable by type/specialty/location (FR-13.1)',
  })
  @ApiOkResponse({ type: [AdminProviderResponseDto] })
  findAll(
    @Query() query: QueryAdminProvidersDto,
  ): Promise<AdminProviderResponseDto[]> {
    return this.adminProvidersService.findAll(query);
  }

  @Post()
  @ApiOperation({ summary: 'Add a provider (FR-13.2, FR-13.3)' })
  @ApiCreatedResponse({ type: AdminProviderResponseDto })
  create(
    @Body() dto: AdminCreateProviderDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edit/deactivate a provider (FR-13.2, FR-13.3) — status flips patient-facing visibility (FR-13.4)',
  })
  @ApiOkResponse({ type: AdminProviderResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.update(id, dto);
  }

  @Put(':id/schedule')
  @ApiOperation({
    summary:
      'Configure working days/hours/slot duration; regenerates AppointmentSlot availability without corrupting booked slots (FR-14.1, FR-14.2, DC-4)',
  })
  @ApiOkResponse({ type: AdminProviderResponseDto })
  updateSchedule(
    @Param('id') id: string,
    @Body() dto: ProviderScheduleDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.updateSchedule(id, dto);
  }

  @Post(':id/blocked-dates')
  @ApiOperation({
    summary:
      'Add a holiday/ad hoc blocked date with a reason label; invalidates open slots only (FR-14.4, DC-4)',
  })
  @ApiCreatedResponse({ type: AdminProviderResponseDto })
  addBlockedDate(
    @Param('id') id: string,
    @Body() dto: BlockedDateDto,
  ): Promise<AdminProviderResponseDto> {
    return this.adminProvidersService.addBlockedDate(id, dto);
  }
}
