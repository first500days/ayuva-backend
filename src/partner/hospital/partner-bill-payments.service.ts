import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerPatientsService } from '../clinical/partner-patients.service';
import {
  AdmissionDocument,
  PartnerAdmission,
} from './schemas/admission.schema';
import {
  ClaimStatus,
  InsuranceClaim,
  InsuranceClaimDocument,
} from './schemas/insurance-claim.schema';
import {
  BillPaymentDocument,
  BillPaymentPart,
  DeskPaymentMethod,
  PartnerBillPayment,
} from './schemas/bill-payment.schema';
import { RecordBillPaymentDto, VoidBillPaymentDto } from './dto/hospital.dto';

const money = (v: number) => Math.round(v * 100) / 100;

export type BillPaymentRow = PartnerBillPayment & {
  _id: Types.ObjectId;
  createdAt?: Date;
};

/**
 * Billing-desk receipts for Billing & Claims. A hospital bill is often settled
 * through several streams (e.g. a cash deposit plus the insurer's share), so
 * each receipt keeps one entry per method and the ledger totals each method
 * separately.
 */
@Injectable()
export class PartnerBillPaymentsService {
  constructor(
    @InjectModel(PartnerBillPayment.name)
    private readonly paymentModel: Model<BillPaymentDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    @InjectModel(InsuranceClaim.name)
    private readonly claimModel: Model<InsuranceClaimDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly audit: AuditLogService,
  ) {}

  async create(actor: PartnerActor, dto: RecordBillPaymentDto) {
    let patientId: Types.ObjectId | undefined;
    let patientName = dto.patientName?.trim();
    let admission: AdmissionDocument | null = null;
    if (dto.admissionId) {
      admission = await this.admissionModel.findOne({
        _id: dto.admissionId,
        providerId: actor.provider._id,
      });
      if (!admission) throw new NotFoundException('Admission not found');
      patientId = admission.patientId;
      patientName = admission.patientName;
    } else if (dto.patientId) {
      const patient = await this.patients.assertLinked(actor, dto.patientId);
      patientId = patient._id;
      patientName = patient.fullName;
    }
    if (!patientName)
      throw new BadRequestException(
        'Link an admission or patient, or enter the patient’s name',
      );

    const claims = await this.claimsFor(actor, dto, admission);
    const parts: BillPaymentPart[] = dto.parts.map((p) => {
      const claim = p.claimId ? claims.get(p.claimId) : undefined;
      return {
        method: p.method,
        amount: money(p.amount),
        reference: p.reference?.trim() || undefined,
        claimId: claim?._id,
        claimNo: claim?.claimNo,
      };
    });
    const receivedAt = new Date();
    const payment = await this.paymentModel.create({
      receiptNo: await this.newNumber(receivedAt),
      providerId: actor.provider._id,
      patientId,
      patientName,
      admissionId: admission?._id,
      description: dto.description?.trim() || undefined,
      parts,
      total: money(parts.reduce((s, p) => s + p.amount, 0)),
      receivedAt,
      recordedByName: actor.member.fullName,
    });
    await this.record(actor, AuditAction.PARTNER_PAYMENT_RECORD, payment, {
      total: payment.total,
      methods: parts.map((p) => p.method).join(' + '),
    });
    return this.row(payment.toObject());
  }

  /** Voided receipts stay listed, struck through, but leave every total. */
  async void(actor: PartnerActor, id: string, dto: VoidBillPaymentDto) {
    const payment = Types.ObjectId.isValid(id)
      ? await this.paymentModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!payment) throw new NotFoundException('Receipt not found');
    if (payment.voidedAt)
      throw new BadRequestException('This receipt is already void');
    payment.voidedAt = new Date();
    payment.voidedByName = actor.member.fullName;
    payment.voidReason = dto.reason.trim();
    await payment.save();
    await this.record(actor, AuditAction.PARTNER_PAYMENT_VOID, payment, {
      total: payment.total,
      reason: payment.voidReason,
    });
    return this.row(payment.toObject());
  }

  /** Receipts in force received since `from`. */
  since(providerId: Types.ObjectId, from: Date): Promise<BillPaymentRow[]> {
    return this.paymentModel
      .find({ providerId, receivedAt: { $gte: from }, voidedAt: null })
      .lean<BillPaymentRow[]>()
      .exec();
  }

  /** The latest receipts, voided ones included, for Recent transactions. */
  latest(providerId: Types.ObjectId, limit: number): Promise<BillPaymentRow[]> {
    return this.paymentModel
      .find({ providerId })
      .sort({ receivedAt: -1 })
      .limit(limit)
      .lean<BillPaymentRow[]>()
      .exec();
  }

  /** Same shape as an online transaction row, plus each method's share. */
  row(p: BillPaymentRow) {
    const methods = p.parts.map((x) => ({
      method: x.method,
      amount: x.amount,
      reference: x.reference ?? null,
      claimNo: x.claimNo ?? null,
    }));
    return {
      id: p._id.toString(),
      source: 'desk' as const,
      receiptNo: p.receiptNo,
      patientName: p.patientName,
      description: p.description ?? null,
      amount: p.total,
      currency: 'INR',
      method: methods.length > 1 ? 'split' : (methods[0]?.method ?? null),
      methods,
      split: methods.length > 1,
      status: p.voidedAt ? 'VOID' : 'SUCCESSFUL',
      settlementStatus: 'desk',
      paidAt: p.receivedAt.toISOString(),
      createdAt: (p.createdAt ?? p.receivedAt).toISOString(),
      recordedByName: p.recordedByName ?? null,
      voidReason: p.voidReason ?? null,
    };
  }

  /**
   * Insurance shares linked to a claim: the claim must belong to this bill and
   * not be rejected, and all receipts together can't bill the insurer for more
   * than it approved (or, before a decision, than was claimed).
   */
  private async claimsFor(
    actor: PartnerActor,
    dto: RecordBillPaymentDto,
    admission: AdmissionDocument | null,
  ) {
    const asked = new Map<string, number>();
    for (const p of dto.parts) {
      if (!p.claimId) continue;
      if (p.method !== DeskPaymentMethod.INSURANCE)
        throw new BadRequestException(
          'Only an insurance share can be linked to a claim',
        );
      asked.set(p.claimId, (asked.get(p.claimId) ?? 0) + p.amount);
    }
    const claims = new Map<string, InsuranceClaimDocument>();
    for (const [claimId, amount] of asked) {
      const claim = await this.claimModel.findOne({
        _id: claimId,
        providerId: actor.provider._id,
      });
      if (!claim) throw new NotFoundException('Claim not found');
      if (
        admission &&
        claim.admissionId &&
        !claim.admissionId.equals(admission._id)
      )
        throw new BadRequestException(
          `${claim.claimNo} belongs to a different admission`,
        );
      if (claim.status === ClaimStatus.REJECTED)
        throw new BadRequestException(
          `${claim.claimNo} was rejected — collect this share another way`,
        );
      const [billed] = await this.paymentModel.aggregate<{ total: number }>([
        {
          $match: {
            providerId: actor.provider._id,
            voidedAt: null,
            'parts.claimId': claim._id,
          },
        },
        { $unwind: '$parts' },
        { $match: { 'parts.claimId': claim._id } },
        { $group: { _id: null, total: { $sum: '$parts.amount' } } },
      ]);
      const cover = claim.amountApproved ?? claim.amountClaimed;
      const already = billed?.total ?? 0;
      if (money(already + amount) > cover)
        throw new BadRequestException(
          `${claim.claimNo} covers ₹${cover}${already ? ` and ₹${already} is already billed to it` : ''} — lower the insurance share`,
        );
      claims.set(claimId, claim);
    }
    return claims;
  }

  private async newNumber(at: Date) {
    const day = at.toISOString().slice(2, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const candidate = `RCT-${day}-${randomBytes(2).toString('hex').toUpperCase()}`;
      if (!(await this.paymentModel.exists({ receiptNo: candidate })))
        return candidate;
    }
    throw new Error('Could not allocate a receipt number');
  }

  private record(
    actor: PartnerActor,
    action: AuditAction,
    p: BillPaymentDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action,
      targetType: 'PartnerBillPayment',
      targetId: p.id,
      metadata: {
        providerId: actor.provider.id,
        ...(p.patientId && { patientId: p.patientId.toString() }),
        label: p.receiptNo,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }
}
