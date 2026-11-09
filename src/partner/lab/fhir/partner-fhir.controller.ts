import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../../core/users/schemas/user.schema';
import {
  PartnerCtx,
  PartnerPermGuard,
  RequirePerm,
} from '../../rbac/partner-perm.guard';
import type { PartnerActor } from '../../rbac/partner-perm.guard';
import { Perm } from '../../rbac/partner-permissions';
import {
  CreateFhirConnectionDto,
  FhirSearchDto,
  UpdateFhirConnectionDto,
} from './fhir.dto';
import { PartnerFhirService } from './partner-fhir.service';

/** FHIR connections (admins) and searching them for reports (lab staff). */
@ApiTags('Partner - Lab FHIR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/lab/fhir')
export class PartnerFhirController {
  constructor(private readonly fhir: PartnerFhirService) {}

  @Get()
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  list(@PartnerCtx() a: PartnerActor) {
    return this.fhir.list(a);
  }

  @Post()
  @RequirePerm(Perm.LAB_CATALOG)
  create(@PartnerCtx() a: PartnerActor, @Body() dto: CreateFhirConnectionDto) {
    return this.fhir.create(a, dto);
  }

  @Patch(':id')
  @RequirePerm(Perm.LAB_CATALOG)
  update(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateFhirConnectionDto,
  ) {
    return this.fhir.update(a, id, dto);
  }

  @Delete(':id')
  @RequirePerm(Perm.LAB_CATALOG)
  remove(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.fhir.remove(a, id);
  }

  @Post(':id/test')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_CATALOG)
  @ApiOperation({ summary: 'Check the address and sign-in against the server' })
  test(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.fhir.test(a, id);
  }

  @Post(':id/search')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_REPORTS_DRAFT)
  @ApiOperation({
    summary: 'Search DiagnosticReport and Observation by patient or encounter',
  })
  search(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: FhirSearchDto,
  ) {
    return this.fhir.search(a, id, dto);
  }
}
