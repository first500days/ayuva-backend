import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import {
  PartnerCtx,
  PartnerPermGuard,
  RequirePerm,
} from '../rbac/partner-perm.guard';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import { PartnerLisService } from './partner-lis.service';
import {
  LisBarcodeDto,
  LisCancelDto,
  LisEntryDto,
  LisQueryDto,
  LisRejectDto,
  RequestLisDto,
} from './dto/lis.dto';

/** Hospital Laboratory Information System (LIS). */
@ApiTags('Partner - Hospital LIS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/lis')
export class PartnerLisController {
  constructor(private readonly lis: PartnerLisService) {}

  @Get('samples')
  @RequirePerm(Perm.LIS_VIEW)
  @ApiOperation({
    summary: 'Worklist: samples by stage, department and priority',
  })
  list(@PartnerCtx() a: PartnerActor, @Query() q: LisQueryDto) {
    return this.lis.list(a, q);
  }

  @Get('scan/:code')
  @RequirePerm(Perm.LIS_VIEW)
  @ApiOperation({ summary: 'Find a sample by tube label or accession number' })
  scan(@PartnerCtx() a: PartnerActor, @Param('code') code: string) {
    return this.lis.scan(a, code);
  }

  @Get('samples/:id')
  @RequirePerm(Perm.LIS_VIEW)
  get(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.lis.get(a, id);
  }

  @Post('samples')
  @RequirePerm(Perm.LIS_MANAGE)
  @ApiOperation({
    summary: 'Request a test on an inpatient, emergency or OPD patient',
  })
  request(@PartnerCtx() a: PartnerActor, @Body() dto: RequestLisDto) {
    return this.lis.request(a, dto);
  }

  @Post('samples/:id/collect')
  @HttpCode(200)
  @RequirePerm(Perm.LIS_MANAGE)
  collect(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: LisBarcodeDto,
  ) {
    return this.lis.collect(a, id, dto);
  }

  @Post('samples/:id/receive')
  @HttpCode(200)
  @RequirePerm(Perm.LIS_MANAGE)
  @ApiOperation({ summary: 'Received in the lab (scanned tube must match)' })
  receive(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: LisBarcodeDto,
  ) {
    return this.lis.receive(a, id, dto);
  }

  @Post('samples/:id/process')
  @HttpCode(200)
  @RequirePerm(Perm.LIS_MANAGE)
  process(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.lis.process(a, id);
  }

  @Post('samples/:id/reject')
  @HttpCode(200)
  @RequirePerm(Perm.LIS_MANAGE)
  @ApiOperation({
    summary: 'Reject an unsuitable sample (and request a new one)',
  })
  reject(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: LisRejectDto,
  ) {
    return this.lis.reject(a, id, dto);
  }

  @Post('samples/:id/cancel')
  @HttpCode(200)
  @RequirePerm(Perm.LIS_MANAGE)
  cancel(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: LisCancelDto,
  ) {
    return this.lis.cancel(a, id, dto);
  }

  @Post('samples/:id/entries')
  @RequirePerm(Perm.LIS_MANAGE)
  @ApiOperation({
    summary: 'Add a text result entry (preliminary, final, addendum, note)',
  })
  addEntry(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: LisEntryDto,
  ) {
    return this.lis.addEntry(a, id, dto);
  }

  @Post('samples/:id/verify')
  @HttpCode(200)
  @RequirePerm(Perm.LIS_VERIFY)
  @ApiOperation({ summary: 'Pathologist verification of the report' })
  verify(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.lis.verify(a, id);
  }
}
