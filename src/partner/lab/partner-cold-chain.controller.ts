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
import { PartnerColdChainService } from './partner-cold-chain.service';
import {
  AddReadingsDto,
  ColdChainQueryDto,
  CreateColdChainRunDto,
  LoggerUploadDto,
  TransitVialDto,
} from './dto/cold-chain.dto';

/** Cold-chain transit logs for home-collected samples. */
@ApiTags('Partner - Lab cold chain')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/lab/cold-chain')
export class PartnerColdChainController {
  constructor(private readonly coldChain: PartnerColdChainService) {}

  @Get()
  @RequirePerm(Perm.LAB_ORDERS_VIEW)
  list(@PartnerCtx() a: PartnerActor, @Query() q: ColdChainQueryDto) {
    return this.coldChain.list(a, q);
  }

  @Post()
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  @ApiOperation({ summary: 'Open a transport box for a collection round' })
  create(@PartnerCtx() a: PartnerActor, @Body() dto: CreateColdChainRunDto) {
    return this.coldChain.create(a, dto);
  }

  @Post(':id/vials')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  addVial(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: TransitVialDto,
  ) {
    return this.coldChain.addVial(a, id, dto.barcode);
  }

  @Post(':id/vials/remove')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  removeVial(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: TransitVialDto,
  ) {
    return this.coldChain.removeVial(a, id, dto.barcode);
  }

  @Post(':id/readings')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  addReadings(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AddReadingsDto,
  ) {
    return this.coldChain.addReadings(a, id, dto);
  }

  @Post(':id/logger')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  @ApiOperation({ summary: 'Import a data-logger CSV export' })
  uploadLogger(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: LoggerUploadDto,
  ) {
    return this.coldChain.uploadLogger(a, id, dto);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePerm(Perm.LAB_ORDERS_MANAGE)
  @ApiOperation({
    summary:
      'Hand the box over at the lab: fixes the verdict and flags excursions on every affected order',
  })
  close(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.coldChain.close(a, id);
  }
}
