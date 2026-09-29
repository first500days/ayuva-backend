import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
} from '../core/payments/schemas/transaction.schema';
import { User, UserDocument } from '../core/users/schemas/user.schema';
import { PartnerContextService } from './partner-context.service';
import { PartnerPaymentsQueryDto } from './dto/partner.dto';

/** P06 — fee display, collection history, payout status and receipts. */
@Injectable()
export class PartnerPaymentsService {
  constructor(
    @InjectModel(Transaction.name) private readonly txModel: Model<TransactionDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly context: PartnerContextService,
  ) {}

  async overview(userId: string, query: PartnerPaymentsQueryDto) {
    const provider = await this.context.requireLive(userId);
    const filter: Record<string, unknown> = { providerId: provider._id };
    if (query.status) filter.status = query.status;
    if (query.settlement) filter.settlementStatus = query.settlement;

    const [txs, totals] = await Promise.all([
      this.txModel.find(filter).sort({ createdAt: -1 }).limit(200).exec(),
      this.txModel.aggregate<{ _id: { status: string; settlement: string }; total: number }>([
        { $match: { providerId: provider._id } },
        {
          $group: {
            _id: { status: '$status', settlement: '$settlementStatus' },
            total: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    const sum = (pred: (k: { status: string; settlement: string }) => boolean) =>
      totals.filter((t) => pred(t._id)).reduce((acc, t) => acc + t.total, 0);
    const paid = (k: { status: string }) => k.status === TransactionStatus.SUCCESSFUL;

    const patients = await this.userModel
      .find({ _id: { $in: txs.map((t) => t.patientId) } })
      .select('fullName')
      .exec();
    const nameById = new Map(patients.map((p) => [p.id, p.fullName]));

    return {
      consultationFee: provider.consultationFee ?? null,
      summary: {
        collected: sum(paid),
        awaitingPayout: sum((k) => paid(k) && k.settlement !== 'settled'),
        settled: sum((k) => paid(k) && k.settlement === 'settled'),
        pending: sum((k) => k.status === TransactionStatus.PENDING),
        refunded: sum((k) => k.status === TransactionStatus.REFUNDED),
      },
      transactions: txs.map((t) => this.toRow(t, nameById.get(t.patientId.toString()))),
    };
  }

  async receipt(userId: string, id: string) {
    const provider = await this.context.requireLive(userId);
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Transaction not found');
    const tx = await this.txModel.findOne({ _id: id, providerId: provider._id });
    if (!tx) throw new NotFoundException('Transaction not found');
    const patient = await this.userModel.findById(tx.patientId).select('fullName').exec();
    return {
      ...this.toRow(tx, patient?.fullName),
      provider: { name: provider.name, registrationNumber: provider.registrationNumber },
      currency: tx.currency,
      refundAmount: tx.refundAmount,
      refundedAt: tx.refundedAt?.toISOString(),
    };
  }

  private toRow(t: TransactionDocument, patientName?: string) {
    return {
      id: t.id,
      receiptNo: `AYV-${t.id.slice(-8).toUpperCase()}`,
      patientName: patientName ?? 'Patient',
      appointmentId: t.appointmentId?.toString(),
      amount: t.amount,
      currency: t.currency,
      method: t.paymentMethod,
      status: t.status,
      settlementStatus: t.settlementStatus,
      settledAt: t.settledAt?.toISOString(),
      paidAt: t.paidAt?.toISOString(),
      createdAt: t.createdAt?.toISOString(),
    };
  }
}
