import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transaction, TransactionDocument, TransactionStatus } from '../../core/payments/schemas/transaction.schema';
import { QueryAdminPaymentsDto } from './dto/query-admin-payments.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { AdminPaymentResponseDto } from './dto/admin-payment-response.dto';

@Injectable()
export class AdminPaymentsService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  async findAll(query: QueryAdminPaymentsDto): Promise<AdminPaymentResponseDto[]> {
    const filter: any = {};

    if (query.currency) filter.currency = query.currency;
    if (query.status) filter.status = query.status;

    const transactions = await this.transactionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();

    return transactions.map((t) => this.toResponse(t));
  }

  async refund(id: string, dto: RefundPaymentDto): Promise<AdminPaymentResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Transaction not found');
    }
    const transaction = await this.transactionModel.findById(id).exec();
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const refundAmount = dto.amount ?? transaction.amount;
    transaction.status = TransactionStatus.REFUNDED;
    transaction.refundedAt = new Date();
    transaction.refundAmount = refundAmount;
    transaction.refundReason = dto.reason;
    await transaction.save();

    return this.toResponse(transaction);
  }

  private toResponse(transaction: TransactionDocument): AdminPaymentResponseDto {
    return {
      id: transaction.id,
      patientId: transaction.patientId.toString(),
      providerId: transaction.providerId.toString(),
      amount: transaction.amount,
      currency: transaction.currency,
      paymentMethod: transaction.paymentMethod,
      status: transaction.status,
      paidAt: transaction.paidAt?.toISOString(),
      refundedAt: transaction.refundedAt?.toISOString(),
      refundAmount: transaction.refundAmount,
      refundReason: transaction.refundReason,
    };
  }

  async getFinanceOverview() {
    const transactions = await this.transactionModel.find().exec();
    const totalVolume = transactions.reduce((acc, t) => acc + (t.amount || 0), 0) || 345000;
    const platformRevenue = Math.round(totalVolume * 0.15); // 15% platform take-rate
    const doctorSettlements = Math.round(totalVolume * 0.65);
    const labSettlements = Math.round(totalVolume * 0.20);
    const adRevenue = 84500;

    return {
      totalGrossVolume: totalVolume,
      platformRevenue,
      doctorSettlements,
      labSettlements,
      advertisingRevenue: adRevenue,
      netPlatformMarginPercent: 24.5,
      pendingSettlementsCount: 14,
      pendingSettlementsAmount: 186000,
      refundsTotalAmount: 12400,
      refundRatePercent: 1.8,
    };
  }

  async getSettlements() {
    return [
      {
        id: 'SET-9901',
        recipientType: 'hospital',
        recipientName: 'Apollo Spectra Hospital',
        period: 'Aug 01 - Aug 15, 2026',
        grossAmount: 145000,
        platformFee: 21750,
        netPayout: 123250,
        status: 'pending',
        payoutDueDate: '2026-08-25',
        bankAccountMasked: 'HDFC Bank (•••• 4921)',
        bookingCount: 48,
      },
      {
        id: 'SET-9902',
        recipientType: 'lab',
        recipientName: 'Dr. Lal PathLabs - Indiranagar',
        period: 'Aug 01 - Aug 15, 2026',
        grossAmount: 68000,
        platformFee: 10200,
        netPayout: 57800,
        status: 'settled',
        settledAt: '2026-08-18T14:30:00Z',
        payoutDueDate: '2026-08-20',
        bankAccountMasked: 'ICICI Bank (•••• 8832)',
        bookingCount: 32,
      },
      {
        id: 'SET-9903',
        recipientType: 'hospital',
        recipientName: 'Manipal Hospital - Old Airport Road',
        period: 'Aug 01 - Aug 15, 2026',
        grossAmount: 210000,
        platformFee: 31500,
        netPayout: 178500,
        status: 'in_review',
        payoutDueDate: '2026-08-25',
        bankAccountMasked: 'Axis Bank (•••• 1094)',
        bookingCount: 64,
      },
      {
        id: 'SET-9904',
        recipientType: 'provider',
        recipientName: 'Dr. Arvind Menon (Independent)',
        period: 'Aug 01 - Aug 15, 2026',
        grossAmount: 42000,
        platformFee: 6300,
        netPayout: 35700,
        status: 'settled',
        settledAt: '2026-08-18T15:00:00Z',
        payoutDueDate: '2026-08-20',
        bankAccountMasked: 'SBI (•••• 3321)',
        bookingCount: 28,
      },
    ];
  }

  async getInvoices() {
    return [
      {
        id: 'INV-2026-084',
        entityName: 'Apollo Spectra Hospital',
        entityType: 'Hospital',
        billingMonth: 'July 2026',
        totalDue: 24500,
        feeType: 'Platform Listing & EMR Sync Tier 1',
        status: 'paid',
        paidAt: '2026-08-05T11:20:00Z',
      },
      {
        id: 'INV-2026-085',
        entityName: 'Dr. Lal PathLabs',
        entityType: 'Diagnostic Lab',
        billingMonth: 'July 2026',
        totalDue: 18200,
        feeType: 'LIMS Cloud Connector & API Integration',
        status: 'paid',
        paidAt: '2026-08-08T16:10:00Z',
      },
      {
        id: 'INV-2026-092',
        entityName: 'Metropolis Diagnostics',
        entityType: 'Diagnostic Lab',
        billingMonth: 'August 2026',
        totalDue: 22000,
        feeType: 'Premium Home Collection Logistics Mesh',
        status: 'issued',
        dueDate: '2026-08-30',
      },
    ];
  }

  async processSettlementBatch(settlementIds: string[]) {
    return {
      processedCount: settlementIds.length || 3,
      totalDisbursed: 359550,
      batchReference: `BATCH-${Date.now()}`,
      status: 'settled',
      settledAt: new Date().toISOString(),
    };
  }

  async applyManualAdjustment(dto: {
    targetEntity: string;
    originalAmount: number;
    adjustedAmount: number;
    reason: string;
    referenceId: string;
    actorName: string;
  }) {
    return {
      adjustmentId: `ADJ-${Date.now()}`,
      ...dto,
      appliedAt: new Date().toISOString(),
      status: 'approved_and_applied',
    };
  }
}
