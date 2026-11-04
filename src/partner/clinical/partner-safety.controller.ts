import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
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
import { PartnerSafetyService } from './partner-safety.service';
import { AddAllergyDto, RemoveAllergyDto, RxCheckDto } from './dto/safety.dto';

/** Allergy alerts and prescription safety checks (clinicians only). */
@ApiTags('Partner - Clinical safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner')
export class PartnerSafetyController {
  constructor(private readonly safety: PartnerSafetyService) {}

  @Get('patients/:id/allergies')
  @RequirePerm(Perm.RECORDS_VIEW)
  @ApiOperation({
    summary: 'Allergies: patient-reported and recorded by your clinicians',
  })
  alerts(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.safety.alerts(a, id);
  }

  @Post('patients/:id/allergies')
  @RequirePerm(Perm.CLINICAL_WRITE)
  addAllergy(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AddAllergyDto,
  ) {
    return this.safety.addAllergy(a, id, dto);
  }

  @Post('patients/:id/allergies/no-known')
  @HttpCode(200)
  @RequirePerm(Perm.CLINICAL_WRITE)
  @ApiOperation({ summary: 'Confirm no known drug allergies' })
  noKnown(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.safety.confirmNoKnownAllergies(a, id);
  }

  @Post('patients/:id/allergies/:allergyId/remove')
  @HttpCode(200)
  @RequirePerm(Perm.CLINICAL_WRITE)
  @ApiOperation({
    summary: 'Mark an entry removed (entered in error) — kept in history',
  })
  removeAllergy(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Param('allergyId') allergyId: string,
    @Body() dto: RemoveAllergyDto,
  ) {
    return this.safety.removeAllergy(a, id, allergyId, dto.reason);
  }

  @Post('clinical/rx-check')
  @HttpCode(200)
  @RequirePerm(Perm.CLINICAL_WRITE)
  @ApiOperation({
    summary:
      'Allergy, interaction and duplicate warnings for a prescription being written',
  })
  check(@PartnerCtx() a: PartnerActor, @Body() dto: RxCheckDto) {
    return this.safety.check(a, dto);
  }
}
