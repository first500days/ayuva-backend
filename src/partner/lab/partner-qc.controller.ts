import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
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
import { PartnerQcService } from './partner-qc.service';
import {
  AddQcRunDto,
  CreateQcMaterialDto,
  QcRunsQueryDto,
  ReviewQcRunDto,
  UpdateQcMaterialDto,
} from './dto/qc.dto';

/**
 * Quality control: technicians and pathologists run controls
 * (lab.reports.draft); setting targets and recording corrective action
 * is for those who sign reports off (lab.reports.release).
 */
@ApiTags('Partner - Lab QC')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/lab/qc')
export class PartnerQcController {
  constructor(private readonly qc: PartnerQcService) {}

  @Get('materials')
  @RequirePerm(Perm.LAB_REPORTS_DRAFT)
  materials(@PartnerCtx() a: PartnerActor) {
    return this.qc.materials(a);
  }

  @Post('materials')
  @RequirePerm(Perm.LAB_REPORTS_RELEASE)
  createMaterial(
    @PartnerCtx() a: PartnerActor,
    @Body() dto: CreateQcMaterialDto,
  ) {
    return this.qc.createMaterial(a, dto);
  }

  @Patch('materials/:id')
  @RequirePerm(Perm.LAB_REPORTS_RELEASE)
  updateMaterial(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateQcMaterialDto,
  ) {
    return this.qc.updateMaterial(a, id, dto);
  }

  @Get('materials/:id/runs')
  @RequirePerm(Perm.LAB_REPORTS_DRAFT)
  @ApiOperation({ summary: 'Levey-Jennings data and observed statistics' })
  runs(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Query() q: QcRunsQueryDto,
  ) {
    return this.qc.runs(a, id, q);
  }

  @Post('materials/:id/runs')
  @RequirePerm(Perm.LAB_REPORTS_DRAFT)
  @ApiOperation({
    summary: 'Record a control run; evaluated by the Westgard rules',
  })
  addRun(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AddQcRunDto,
  ) {
    return this.qc.addRun(a, id, dto);
  }

  @Post('runs/:id/review')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_REPORTS_RELEASE)
  @ApiOperation({
    summary: 'Record corrective action on a warning or rejection',
  })
  review(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: ReviewQcRunDto,
  ) {
    return this.qc.review(a, id, dto);
  }
}
