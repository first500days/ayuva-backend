import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../core/users/schemas/user.schema';
import { PartnerWardsService } from './partner-wards.service';
import {
  AddBedsDto,
  AdmissionsQueryDto,
  AdmitDto,
  CreateWardDto,
  DischargeAdmissionDto,
  SaveWardLayoutDto,
  SetBedStatusDto,
  TransferAdmissionDto,
  UpdateWardDto,
} from './dto/partner-wards.dto';

/** Hospital Portal — wards, beds, census and admissions. */
@ApiTags('Partner - Hospital')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PARTNER)
@Controller('partner')
export class PartnerWardsController {
  constructor(private readonly wards: PartnerWardsService) {}

  @Get('wards')
  @ApiOperation({ summary: 'List wards with their beds and current occupants' })
  listWards(@CurrentUser() u: JwtPayload) {
    return this.wards.listWards(u.sub);
  }

  @Get('wards/census')
  @ApiOperation({ summary: 'Occupancy summary across all wards' })
  census(@CurrentUser() u: JwtPayload) {
    return this.wards.census(u.sub);
  }

  @Post('wards')
  @ApiOperation({ summary: 'Create a ward with N beds' })
  createWard(@CurrentUser() u: JwtPayload, @Body() dto: CreateWardDto) {
    return this.wards.createWard(u.sub, dto);
  }

  @Patch('wards/:id')
  @ApiOperation({ summary: 'Update ward details or bed capacity' })
  updateWard(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() dto: UpdateWardDto) {
    return this.wards.updateWard(u.sub, id, dto);
  }

  @Patch('wards/:id/layout')
  @ApiOperation({ summary: 'Save the floor-plan positions of a ward\'s beds' })
  saveLayout(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() dto: SaveWardLayoutDto) {
    return this.wards.saveLayout(u.sub, id, dto);
  }

  @Post('wards/:id/beds')
  @ApiOperation({ summary: 'Add more beds to a ward' })
  addBeds(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() dto: AddBedsDto) {
    return this.wards.addBeds(u.sub, id, dto);
  }

  @Patch('wards/:wardId/beds/:bedId')
  @ApiOperation({ summary: 'Change a bed\'s status (not for admitting/discharging a patient)' })
  setBed(
    @CurrentUser() u: JwtPayload,
    @Param('wardId') wardId: string,
    @Param('bedId') bedId: string,
    @Body() dto: SetBedStatusDto,
  ) {
    return this.wards.setBed(u.sub, wardId, bedId, dto.status);
  }

  @Delete('wards/:id')
  @ApiOperation({ summary: 'Remove an empty ward' })
  removeWard(@CurrentUser() u: JwtPayload, @Param('id') id: string) {
    return this.wards.removeWard(u.sub, id);
  }

  @Get('admissions')
  @ApiOperation({ summary: 'List admissions, optionally filtered' })
  listAdmissions(@CurrentUser() u: JwtPayload, @Query() q: AdmissionsQueryDto) {
    return this.wards.listAdmissions(u.sub, q);
  }

  @Post('admissions')
  @ApiOperation({ summary: 'Admit a patient to a bed' })
  admit(@CurrentUser() u: JwtPayload, @Body() dto: AdmitDto) {
    return this.wards.admit(u.sub, dto);
  }

  @Post('admissions/:id/transfer')
  @ApiOperation({ summary: 'Move an admitted patient to another bed/ward' })
  transfer(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() dto: TransferAdmissionDto) {
    return this.wards.transfer(u.sub, id, dto);
  }

  @Post('admissions/:id/discharge')
  @ApiOperation({ summary: 'Discharge a patient and free their bed' })
  discharge(@CurrentUser() u: JwtPayload, @Param('id') id: string, @Body() dto: DischargeAdmissionDto) {
    return this.wards.discharge(u.sub, id, dto);
  }
}
