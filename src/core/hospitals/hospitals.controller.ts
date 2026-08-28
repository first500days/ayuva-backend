import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ConsentGuard } from '../../auth/guards/consent.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { HospitalsService } from './hospitals.service';
import { QueryHospitalsDto } from './dto/query-hospitals.dto';
import { HospitalResponseDto } from './dto/hospital-response.dto';
import { ProviderResponseDto } from '../providers/dto/provider-response.dto';

@ApiTags('Hospitals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ConsentGuard)
@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Get()
  @ApiOperation({ summary: 'Search/filter hospitals (FR-7.5)' })
  @ApiOkResponse({ type: [HospitalResponseDto] })
  findAll(@Query() query: QueryHospitalsDto): Promise<HospitalResponseDto[]> {
    return this.hospitalsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Hospital detail (FR-7.6)' })
  @ApiOkResponse({ type: HospitalResponseDto })
  findOne(@Param('id') id: string): Promise<HospitalResponseDto> {
    return this.hospitalsService.findOne(id);
  }

  @Get(':id/doctors')
  @ApiOperation({ summary: 'Providers practising at this hospital (FR-7.6)' })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  getDoctors(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ProviderResponseDto[]> {
    return this.hospitalsService.getDoctors(id, user.sub);
  }
}
