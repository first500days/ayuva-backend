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
}
