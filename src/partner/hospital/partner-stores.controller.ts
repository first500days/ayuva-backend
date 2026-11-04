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
import { PartnerAssetsService } from './partner-assets.service';
import {
  AdjustStockDto,
  CreateAssetDto,
  CreateStockItemDto,
  IssueStockDto,
  LogMaintenanceDto,
  UpdateAssetDto,
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

/** Hospital Inventory & Central Supply: consumables, implants and equipment upkeep. */
@ApiTags('Partner - Central Supply')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PartnerPermGuard)
@Roles(UserRole.PARTNER)
@Controller('partner/supply')
export class PartnerSupplyController {
  constructor(
    private readonly stock: PartnerStockService,
    private readonly assets: PartnerAssetsService,
  ) {}

  @Get('items')
  @RequirePerm(Perm.SUPPLY_VIEW)
  @ApiOperation({
    summary:
      'Consumables, surgical items and implants with batches and reorder state',
  })
  items(@PartnerCtx() a: PartnerActor, @Query() q: StockItemsQueryDto) {
    return this.stock.list(a, StoreKind.CENTRAL, q);
  }

  @Post('items')
  @RequirePerm(Perm.SUPPLY_MANAGE)
  createItem(@PartnerCtx() a: PartnerActor, @Body() dto: CreateStockItemDto) {
    return this.stock.create(a, StoreKind.CENTRAL, dto);
  }

  @Patch('items/:id')
  @RequirePerm(Perm.SUPPLY_MANAGE)
  updateItem(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateStockItemDto,
  ) {
    return this.stock.update(a, StoreKind.CENTRAL, id, dto);
  }

  @Post('items/:id/receive')
  @RequirePerm(Perm.SUPPLY_MANAGE)
  receive(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.stock.receive(a, StoreKind.CENTRAL, id, dto);
  }

  @Post('items/:id/adjust')
  @HttpCode(200)
  @RequirePerm(Perm.SUPPLY_MANAGE)
  adjust(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.stock.adjust(a, StoreKind.CENTRAL, id, dto);
  }

  @Post('items/:id/issue')
  @RequirePerm(Perm.SUPPLY_MANAGE)
  @ApiOperation({
    summary:
      'Issue to a department, ward, theatre or patient (implants need the patient)',
  })
  issue(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: IssueStockDto,
  ) {
    return this.stock.issue(a, StoreKind.CENTRAL, id, dto);
  }

  @Get('moves')
  @RequirePerm(Perm.SUPPLY_VIEW)
  moves(@PartnerCtx() a: PartnerActor, @Query() q: StockMovesQueryDto) {
    return this.stock.moves(a, StoreKind.CENTRAL, q);
  }

  @Get('assets')
  @RequirePerm(Perm.SUPPLY_VIEW)
  @ApiOperation({
    summary: 'Equipment register with maintenance and calibration due dates',
  })
  listAssets(@PartnerCtx() a: PartnerActor) {
    return this.assets.list(a);
  }

  @Post('assets')
  @RequirePerm(Perm.SUPPLY_MANAGE)
  createAsset(@PartnerCtx() a: PartnerActor, @Body() dto: CreateAssetDto) {
    return this.assets.create(a, dto);
  }

  @Patch('assets/:id')
  @RequirePerm(Perm.SUPPLY_MANAGE)
  updateAsset(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.assets.update(a, id, dto);
  }

  @Post('assets/:id/logs')
  @RequirePerm(Perm.SUPPLY_MANAGE)
  @ApiOperation({ summary: 'Log a service, calibration, breakdown or repair' })
  logMaintenance(
    @PartnerCtx() a: PartnerActor,
    @Param('id') id: string,
    @Body() dto: LogMaintenanceDto,
  ) {
    return this.assets.log(a, id, dto);
  }
}
