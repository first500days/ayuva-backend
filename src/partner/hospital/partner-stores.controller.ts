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
import { StoreKind } from './schemas/stock-item.schema';
import { PartnerStockService } from './partner-stock.service';
import { PartnerPharmacyService } from './partner-pharmacy.service';
import {
  AdjustStockDto,
  CreateStockItemDto,
  DispenseDto,
  PharmacyQueueQueryDto,
  ReceiveStockDto,
  StockItemsQueryDto,
  StockMovesQueryDto,
  StockSearchQueryDto,
  UpdateStockItemDto,
} from './dto/stores.dto';

/** Hospital Pharmacy & Medication Management. */
@ApiTags('Partner - Pharmacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/pharmacy')
export class PartnerPharmacyController {
  constructor(
    private readonly stock: PartnerStockService,
    private readonly pharmacy: PartnerPharmacyService,
  ) {}

  @Get('items')
  @RequirePerm(Perm.PHARMACY_STOCK)
  @ApiOperation({
    summary: 'Pharmacy stock: medicines with batches, expiry and reorder state',
  })
  items(@PartnerCtx() a: PartnerActor, @Query() q: StockItemsQueryDto) {
    return this.stock.list(a, StoreKind.PHARMACY, q);
  }

  @Post('items')
  @RequirePerm(Perm.PHARMACY_STOCK)
  createItem(@PartnerCtx() a: PartnerActor, @Body() dto: CreateStockItemDto) {
    return this.stock.create(a, StoreKind.PHARMACY, dto);
  }

  @Patch('items/:id')
  @RequirePerm(Perm.PHARMACY_STOCK)
  updateItem(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateStockItemDto,
  ) {
    return this.stock.update(a, StoreKind.PHARMACY, id, dto);
  }

  @Post('items/:id/receive')
  @RequirePerm(Perm.PHARMACY_STOCK)
  @ApiOperation({
    summary: 'Receive a delivery (batch, expiry, price) into stock',
  })
  receive(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.stock.receive(a, StoreKind.PHARMACY, id, dto);
  }

  @Post('items/:id/adjust')
  @HttpCode(200)
  @RequirePerm(Perm.PHARMACY_STOCK)
  @ApiOperation({
    summary: 'Count correction, expiry/damage write-off or return to supplier',
  })
  adjust(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.stock.adjust(a, StoreKind.PHARMACY, id, dto);
  }

  @Get('moves')
  @RequirePerm(Perm.PHARMACY_STOCK)
  @ApiOperation({ summary: 'Stock ledger' })
  moves(@PartnerCtx() a: PartnerActor, @Query() q: StockMovesQueryDto) {
    return this.stock.moves(a, StoreKind.PHARMACY, q);
  }

  @Get('queue')
  @RequirePerm(Perm.PHARMACY_DISPENSE)
  @ApiOperation({
    summary:
      "Signed e-prescriptions from the hospital's clinicians, with dispensing status",
  })
  queue(@PartnerCtx() a: PartnerActor, @Query() q: PharmacyQueueQueryDto) {
    return this.pharmacy.queue(a, q);
  }

  @Get('queue/:id')
  @RequirePerm(Perm.PHARMACY_DISPENSE)
  prescription(@PartnerCtx() a: PartnerActor, @Param('id') id: string) {
    return this.pharmacy.get(a, id);
  }

  @Post('queue/:id/dispense')
  @RequirePerm(Perm.PHARMACY_DISPENSE)
  @ApiOperation({
    summary: 'Dispense prescription lines from stock (first-expiry-first-out)',
  })
  dispense(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: DispenseDto,
  ) {
    return this.pharmacy.dispense(a, id, dto);
  }

  @Get('search')
  @RequirePerm(Perm.PHARMACY_DISPENSE)
  @ApiOperation({ summary: 'Find a stocked medicine to supply' })
  search(@PartnerCtx() a: PartnerActor, @Query() q: StockSearchQueryDto) {
    return this.pharmacy.search(a, q.q);
  }
}
