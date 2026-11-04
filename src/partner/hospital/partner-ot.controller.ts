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
import { PartnerOtService } from './partner-ot.service';
import {
  BookOtCaseDto,
  CreateOtRoomDto,
  OtAvailabilityQueryDto,
  OtCasesQueryDto,
  OtChecklistDto,
  OtPostOpDto,
  OtStageDto,
  OtTimeDto,
  UpdateOtCaseDto,
  UpdateOtRoomDto,
} from './dto/ot.dto';

/** Operation Theatre Scheduler (hospitals). */
@ApiTags('Partner - Operation Theatre')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/ot')
export class PartnerOtController {
  constructor(private readonly ot: PartnerOtService) {}

  @Get('rooms')
  @RequirePerm(Perm.OT_VIEW)
  rooms(@PartnerCtx() a: PartnerActor) {
    return this.ot.rooms(a);
  }

  @Post('rooms')
  @RequirePerm(Perm.OT_MANAGE)
  createRoom(@PartnerCtx() a: PartnerActor, @Body() dto: CreateOtRoomDto) {
    return this.ot.createRoom(a, dto);
  }

  @Patch('rooms/:id')
  @RequirePerm(Perm.OT_MANAGE)
  updateRoom(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateOtRoomDto,
  ) {
    return this.ot.updateRoom(a, id, dto);
  }

  @Get('cases')
  @RequirePerm(Perm.OT_VIEW)
  @ApiOperation({
    summary: 'Theatres and cases in a time range (day / week views)',
  })
  cases(@PartnerCtx() a: PartnerActor, @Query() q: OtCasesQueryDto) {
    return this.ot.list(a, q);
  }

  @Get('availability')
  @RequirePerm(Perm.OT_VIEW)
  @ApiOperation({
    summary: "Doctors' duty roster and theatre bookings on a date",
  })
  availability(
    @PartnerCtx() a: PartnerActor,
    @Query() q: OtAvailabilityQueryDto,
  ) {
    return this.ot.availability(a, q);
  }

  @Get('cases/:id')
  @RequirePerm(Perm.OT_VIEW)
  get(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.ot.get(a, id);
  }

  @Post('cases')
  @RequirePerm(Perm.OT_MANAGE)
  @ApiOperation({
    summary: 'Book a case (theatre, surgeon and anaesthetist must be free)',
  })
  book(@PartnerCtx() a: PartnerActor, @Body() dto: BookOtCaseDto) {
    return this.ot.book(a, dto);
  }

  @Patch('cases/:id')
  @RequirePerm(Perm.OT_MANAGE)
  @ApiOperation({ summary: 'Reschedule or edit a case that has not started' })
  update(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateOtCaseDto,
  ) {
    return this.ot.update(a, id, dto);
  }

  @Post('cases/:id/stage')
  @HttpCode(200)
  @RequirePerm(Perm.OT_MANAGE)
  @ApiOperation({
    summary:
      'Move the case: pre-op → in theatre → recovery → completed (or cancel / postpone)',
  })
  stage(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: OtStageDto,
  ) {
    return this.ot.stage(a, id, dto);
  }

  @Post('cases/:id/checklist')
  @HttpCode(200)
  @RequirePerm(Perm.OT_MANAGE)
  @ApiOperation({
    summary: 'Pre-op readiness and the WHO Sign In / Time Out / Sign Out',
  })
  checklist(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: OtChecklistDto,
  ) {
    return this.ot.checklist(a, id, dto);
  }

  @Post('cases/:id/times')
  @HttpCode(200)
  @RequirePerm(Perm.OT_MANAGE)
  @ApiOperation({
    summary:
      'Record a theatre / recovery time (anaesthesia start, incision, closure…)',
  })
  time(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: OtTimeDto,
  ) {
    return this.ot.time(a, id, dto);
  }

  @Post('cases/:id/post-op')
  @HttpCode(200)
  @RequirePerm(Perm.OT_MANAGE)
  @ApiOperation({ summary: 'Operation note' })
  postOp(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: OtPostOpDto,
  ) {
    return this.ot.postOp(a, id, dto);
  }
}
