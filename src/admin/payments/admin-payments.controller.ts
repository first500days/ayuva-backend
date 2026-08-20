import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../core/users/schemas/user.schema';
import { AdminPaymentsService } from './admin-payments.service';
import { QueryAdminPaymentsDto } from './dto/query-admin-payments.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { AdminPaymentResponseDto } from './dto/admin-payment-response.dto';
import { AuditLogInterceptor } from '../../audit-log/interceptors/audit-log.interceptor';
import { AuditEvent } from '../../audit-log/decorators/audit-event.decorator';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';

@ApiTags('Admin - Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly adminPaymentsService: AdminPaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Payment transactions (FR-5.12)' })
  @ApiOkResponse({ type: [AdminPaymentResponseDto] })
  findAll(@Query() query: QueryAdminPaymentsDto): Promise<AdminPaymentResponseDto[]> {
    return this.adminPaymentsService.findAll(query);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Finance overview with margin & revenue metrics' })
  getFinanceOverview() {
    return this.adminPaymentsService.getFinanceOverview();
  }

  @Get('settlements')
  @ApiOperation({ summary: 'Provider and lab settlement payouts queue' })
  getSettlements() {
    return this.adminPaymentsService.getSettlements();
  }

  @Post('settlements/process-batch')
  @ApiOperation({ summary: 'Batch process approved settlements' })
  processSettlementBatch(@Body() body: { settlementIds: string[] }) {
    return this.adminPaymentsService.processSettlementBatch(body.settlementIds || []);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Provider and lab platform invoices' })
  getInvoices() {
    return this.adminPaymentsService.getInvoices();
  }

  @Post('adjustments')
  @ApiOperation({ summary: 'Apply manual financial adjustment with audit reason' })
  applyAdjustment(@Body() body: any) {
    return this.adminPaymentsService.applyManualAdjustment(body);
  }

  @Patch(':id/refund')
  @ApiOperation({ summary: 'Refund a payment (FR-5.12)' })
  @ApiOkResponse({ type: AdminPaymentResponseDto })
  @AuditEvent(AuditAction.ADMIN_PAYMENT_REFUND, 'Transaction')
  @UseInterceptors(AuditLogInterceptor)
  refund(@Param('id') id: string, @Body() dto: RefundPaymentDto): Promise<AdminPaymentResponseDto> {
    return this.adminPaymentsService.refund(id, dto);
  }
}
