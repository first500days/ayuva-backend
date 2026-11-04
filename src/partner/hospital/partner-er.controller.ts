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
import { PartnerErService } from './partner-er.service';
import {
  AssignErDto,
  DisposeErDto,
  ErBoardQueryDto,
  RegisterErDto,
  TriageDto,
  UpdateErPatientDto,
} from './dto/er.dto';

/** Emergency & ER Triage (hospitals). */
@ApiTags('Partner - Emergency')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/er')
export class PartnerErController {
  constructor(private readonly er: PartnerErService) {}

  @Get()
  @RequirePerm(Perm.ER_VIEW)
  @ApiOperation({
    summary:
      'ER board: patients in the department by acuity, with waits and breaches',
  })
  board(@PartnerCtx() a: PartnerActor, @Query() q: ErBoardQueryDto) {
    return this.er.board(a, q);
  }

  @Get(':id')
  @RequirePerm(Perm.ER_VIEW)
  get(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.er.get(a, id);
  }

  @Post()
  @RequirePerm(Perm.ER_MANAGE)
  @ApiOperation({
    summary:
      'Quick registration (unidentified patients allowed), optionally triaged at the door',
  })
  register(@PartnerCtx() a: PartnerActor, @Body() dto: RegisterErDto) {
    return this.er.register(a, dto);
  }

  @Patch(':id')
  @RequirePerm(Perm.ER_MANAGE)
  @ApiOperation({
    summary: 'Identify the patient / update details and medico-legal case',
  })
  update(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateErPatientDto,
  ) {
    return this.er.updatePatient(a, id, dto);
  }

  @Post(':id/triage')
  @HttpCode(200)
  @RequirePerm(Perm.ER_TRIAGE)
  @ApiOperation({ summary: 'Triage or re-triage (level 1–5 with vital signs)' })
  triage(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: TriageDto,
  ) {
    return this.er.triage(a, id, dto);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePerm(Perm.ER_TRIAGE)
  @ApiOperation({
    summary: 'A doctor takes the patient (sets door-to-doctor time)',
  })
  assign(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AssignErDto,
  ) {
    return this.er.assign(a, id, dto);
  }

  @Post(':id/dispose')
  @HttpCode(200)
  @RequirePerm(Perm.ER_TRIAGE)
  @ApiOperation({
    summary:
      'Close the visit: admitted, discharged, referred, LAMA, absconded, deceased',
  })
  dispose(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: DisposeErDto,
  ) {
    return this.er.dispose(a, id, dto);
  }
}
