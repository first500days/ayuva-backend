import { Controller, Get, Put, Post, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminArea } from '../../common/decorators/admin-area.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminLabDeliveriesService } from './admin-lab-deliveries.service';
import { QueryLabDeliveriesDto } from './dto/query-lab-deliveries.dto';
import { UpdateLabDeliveryDto, RetryDeliveryDto, ManualDeliveryDto } from './dto/update-lab-delivery.dto';
import { AdminLabDeliveryResponseDto } from './dto/admin-lab-delivery-response.dto';

// Was reachable without signing in; now admin-only like the rest of the panel.
@ApiTags('Admin - Lab Deliveries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@AdminArea('lab-deliveries')
@Controller('admin/lab-deliveries')
export class AdminLabDeliveriesController {
  constructor(private readonly service: AdminLabDeliveriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all lab deliveries with filters' })
  @ApiResponse({ status: 200, type: [AdminLabDeliveryResponseDto] })
  async findAll(@Query() query: QueryLabDeliveriesDto): Promise<AdminLabDeliveryResponseDto[]> {
    return this.service.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get delivery statistics' })
  @ApiResponse({ status: 200 })
  async getStats() {
    return this.service.getStats();
  }

  @Get('stuck')
  @ApiOperation({ summary: 'Get stuck deliveries (not updated in 24h)' })
  @ApiResponse({ status: 200, type: [AdminLabDeliveryResponseDto] })
  async getStuck(@Query('hours') hours?: number): Promise<AdminLabDeliveryResponseDto[]> {
    return this.service.getStuckDeliveries(hours || 24);
  }

  @Get('failed')
  @ApiOperation({ summary: 'Get failed deliveries' })
  @ApiResponse({ status: 200, type: [AdminLabDeliveryResponseDto] })
  async getFailed(): Promise<AdminLabDeliveryResponseDto[]> {
    return this.service.getFailedDeliveries();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lab delivery by ID' })
  @ApiParam({ name: 'id', description: 'Delivery ObjectId' })
  @ApiResponse({ status: 200, type: AdminLabDeliveryResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string): Promise<AdminLabDeliveryResponseDto> {
    return this.service.findOne(id);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get lab delivery by order ID' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, type: AdminLabDeliveryResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findByOrderId(@Param('orderId') orderId: string): Promise<AdminLabDeliveryResponseDto> {
    return this.service.findByOrderId(orderId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update lab delivery' })
  @ApiParam({ name: 'id', description: 'Delivery ObjectId' })
  @ApiResponse({ status: 200, type: AdminLabDeliveryResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLabDeliveryDto,
  ): Promise<AdminLabDeliveryResponseDto> {
    return this.service.update(id, dto);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry delivery with specified method' })
  @ApiParam({ name: 'id', description: 'Delivery ObjectId' })
  @ApiResponse({ status: 200, type: AdminLabDeliveryResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async retryDelivery(
    @Param('id') id: string,
    @Body() dto: RetryDeliveryDto,
  ): Promise<AdminLabDeliveryResponseDto> {
    return this.service.retryDelivery(id, dto);
  }

  @Post(':id/manual-delivery')
  @ApiOperation({ summary: 'Mark delivery as manually delivered with report file' })
  @ApiParam({ name: 'id', description: 'Delivery ObjectId' })
  @ApiResponse({ status: 200, type: AdminLabDeliveryResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async manualDelivery(
    @Param('id') id: string,
    @Body() dto: ManualDeliveryDto,
  ): Promise<AdminLabDeliveryResponseDto> {
    return this.service.manualDelivery(id, dto);
  }
}