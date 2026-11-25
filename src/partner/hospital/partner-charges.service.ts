import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerDocumentsService } from '../documents/partner-documents.service';
import type { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm } from '../rbac/partner-permissions';
import {
  PartnerPatientIntake,
  PartnerPatientIntakeDocument,
} from '../clinical/schemas/patient-intake.schema';
import {
  AddChargeDto,
  CreateServicePriceDto,
  UpdateServicePriceDto,
  VoidChargeDto,
} from './dto/charges.dto';
import {
  AdmissionDocument,
  PartnerAdmission,
} from './schemas/admission.schema';
import {
  PartnerAdmissionCharge,
  PartnerAdmissionChargeDocument,
} from './schemas/admission-charge.schema';
import {
  BillPaymentDocument,
  PartnerBillPayment,
} from './schemas/bill-payment.schema';
import {
  type ChargeCategory,
  PartnerServicePrice,
  PartnerServicePriceDocument,
} from './schemas/service-price.schema';

/** Rupees to paise and back, so totals never drift. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A charge's money: quantity × rate, then GST on it. */
export function chargeMoney(
  unitPrice: number,
  quantity: number,
  taxPct: number,
) {
  const amount = round2(unitPrice * quantity);
  const tax = round2((amount * taxPct) / 100);
  return { amount, tax, total: round2(amount + tax) };
}

/** Who may do what (RequirePerm can only ask for all of a list, so these are checked here). */
const CAN_SEE = [Perm.WARDS_VIEW, Perm.BILLING_VIEW];
const CAN_CHARGE = [Perm.WARDS_MANAGE, Perm.BILLING_VIEW];
// A line that isn't on the price list sets its own price: billing and admins only.
const CAN_PRICE_FREELY = [Perm.BILLING_VIEW, Perm.ORG_SETTINGS];

/**
 * The hospital's price list and what each admitted patient was given:
 * medicines, products, bed days, procedures. Gives each admission a running
 * bill (charges, GST, desk receipts, balance) and its itemised PDF. An unpaid
 * balance is a warning; it never blocks discharge.
 */
@Injectable()
export class PartnerChargesService {
  constructor(
    @InjectModel(PartnerServicePrice.name)
    private readonly priceModel: Model<PartnerServicePriceDocument>,
    @InjectModel(PartnerAdmissionCharge.name)
    private readonly chargeModel: Model<PartnerAdmissionChargeDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    @InjectModel(PartnerBillPayment.name)
    private readonly paymentModel: Model<BillPaymentDocument>,
    @InjectModel(PartnerPatientIntake.name)
    private readonly intakeModel: Model<PartnerPatientIntakeDocument>,
    private readonly documents: PartnerDocumentsService,
    private readonly audit: AuditLogService,
  ) {}

  // ── Price list ──────────────────────────────────────────────────────────

  async prices(actor: PartnerActor, includeInactive = false) {
    this.need(actor, [...CAN_SEE, Perm.ORG_SETTINGS], 'see the price list');
    const rows = await this.priceModel
      .find({
        providerId: actor.provider._id,
        ...(!includeInactive && { active: true }),
      })
      .sort({ category: 1, name: 1 })
      .exec();
    return rows.map((p) => this.priceView(p));
  }

  async createPrice(actor: PartnerActor, dto: CreateServicePriceDto) {
    try {
      const p = await this.priceModel.create({
        providerId: actor.provider._id,
        name: dto.name.trim(),
        category: dto.category,
        price: round2(dto.price),
        unit: dto.unit?.trim() || 'each',
        taxPct: dto.taxPct ?? 0,
      });
      await this.record(
        actor,
        AuditAction.PARTNER_SETTINGS_UPDATE,
        'PartnerServicePrice',
        p.id,
        `Price added: ${p.name}`,
      );
      return this.priceView(p);
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException(
          `"${dto.name.trim()}" is already on the price list`,
        );
      throw err;
    }
  }

  async updatePrice(
    actor: PartnerActor,
    id: string,
    dto: UpdateServicePriceDto,
  ) {
    const p = await this.priceModel
      .findOne({ _id: this.id(id), providerId: actor.provider._id })
      .exec();
    if (!p) throw new NotFoundException('Price not found');
    if (dto.name !== undefined) p.name = dto.name.trim();
    if (dto.category !== undefined) p.category = dto.category;
    if (dto.price !== undefined) p.price = round2(dto.price);
    if (dto.unit !== undefined) p.unit = dto.unit.trim() || 'each';
    if (dto.taxPct !== undefined) p.taxPct = dto.taxPct;
    if (dto.active !== undefined) p.active = dto.active;
    try {
      await p.save();
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException(`"${p.name}" is already on the price list`);
      throw err;
    }
    // Charges already added keep the price they were added at.
    await this.record(
      actor,
      AuditAction.PARTNER_SETTINGS_UPDATE,
      'PartnerServicePrice',
      p.id,
      `Price changed: ${p.name}`,
    );
    return this.priceView(p);
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  async bill(actor: PartnerActor, admissionId: string) {
    this.need(actor, CAN_SEE, 'see admission charges');
    const a = await this.loadAdmission(actor, admissionId);
    return this.summary(actor, a);
  }

  async addCharge(actor: PartnerActor, admissionId: string, dto: AddChargeDto) {
    this.need(actor, CAN_CHARGE, 'add charges');
    const a = await this.loadAdmission(actor, admissionId);
    let line: {
      name: string;
      category: ChargeCategory;
      unit: string;
      unitPrice: number;
      taxPct: number;
      serviceId?: Types.ObjectId;
    };
    if (dto.serviceId) {
      const p = await this.priceModel
        .findOne({
          _id: this.id(dto.serviceId),
          providerId: actor.provider._id,
          active: true,
        })
        .exec();
      if (!p) throw new NotFoundException('That item is not on the price list');
      line = {
        name: p.name,
        category: p.category,
        unit: p.unit,
        unitPrice: p.price,
        taxPct: p.taxPct,
        serviceId: p._id,
      };
    } else {
      this.need(
        actor,
        CAN_PRICE_FREELY,
        'add items that are not on the price list',
      );
      if (!dto.name?.trim() || dto.unitPrice === undefined)
        throw new BadRequestException(
          'Choose an item from the price list, or give a name and a price',
        );
      line = {
        name: dto.name.trim(),
        category: dto.category ?? 'other',
        unit: dto.unit?.trim() || 'each',
        unitPrice: round2(dto.unitPrice),
        taxPct: dto.taxPct ?? 0,
      };
    }
    const givenAt = dto.givenAt ? new Date(dto.givenAt) : new Date();
    if (
      Number.isNaN(givenAt.getTime()) ||
      givenAt < a.admittedAt ||
      givenAt.getTime() > Date.now() + 60_000
    )
      throw new BadRequestException(
        'The date given must be between admission and now',
      );
    const money = chargeMoney(line.unitPrice, dto.quantity, line.taxPct);
    const c = await this.chargeModel.create({
      providerId: actor.provider._id,
      admissionId: a._id,
      ...(a.patientId && { patientId: a.patientId }),
      ...line,
      quantity: dto.quantity,
      ...money,
      givenAt,
      note: dto.note?.trim() || undefined,
      addedByMemberId: actor.member._id,
      addedByName: actor.member.fullName,
    });
    await this.record(
      actor,
      AuditAction.PARTNER_ADMISSION_UPDATE,
      'PartnerAdmissionCharge',
      c.id,
      `Charge ${a.admissionNo}: ${c.name} × ${c.quantity}`,
    );
    return this.summary(actor, a);
  }

  async voidCharge(actor: PartnerActor, chargeId: string, dto: VoidChargeDto) {
    this.need(actor, CAN_CHARGE, 'void charges');
    const c = await this.chargeModel
      .findOne({ _id: this.id(chargeId), providerId: actor.provider._id })
      .exec();
    if (!c) throw new NotFoundException('Charge not found');
    if (c.voidedAt)
      throw new BadRequestException('This charge is already voided');
    c.voidedAt = new Date();
    c.voidedByName = actor.member.fullName;
    c.voidReason = dto.reason.trim();
    await c.save();
    const a = await this.loadAdmission(actor, c.admissionId.toString());
    await this.record(
      actor,
      AuditAction.PARTNER_ADMISSION_UPDATE,
      'PartnerAdmissionCharge',
      c.id,
      `Charge voided ${a.admissionNo}: ${c.name} (${c.voidReason})`,
    );
    return this.summary(actor, a);
  }

  /** Balance per admission for the admissions list (one query each for charges and receipts). */
  async balances(actor: PartnerActor, admissionIds: string[]) {
    const out = new Map<
      string,
      { total: number; paid: number; balance: number }
    >();
    if (
      !admissionIds.length ||
      !actor.permissions.some((p) => CAN_SEE.includes(p))
    )
      return out;
    const ids = admissionIds.map((id) => new Types.ObjectId(id));
    const [charges, paid] = await Promise.all([
      this.chargeModel
        .aggregate<{ _id: Types.ObjectId; total: number }>([
          {
            $match: {
              providerId: actor.provider._id,
              admissionId: { $in: ids },
              voidedAt: { $exists: false },
            },
          },
          { $group: { _id: '$admissionId', total: { $sum: '$total' } } },
        ])
        .exec(),
      this.paymentModel
        .aggregate<{ _id: Types.ObjectId; total: number }>([
          {
            $match: {
              providerId: actor.provider._id,
              admissionId: { $in: ids },
              voidedAt: { $exists: false },
            },
          },
          { $group: { _id: '$admissionId', total: { $sum: '$total' } } },
        ])
        .exec(),
    ]);
    const paidBy = new Map(paid.map((p) => [p._id.toString(), p.total]));
    for (const c of charges) {
      const total = round2(c.total);
      const p = round2(paidBy.get(c._id.toString()) ?? 0);
      out.set(c._id.toString(), { total, paid: p, balance: round2(total - p) });
    }
    for (const [id, p] of paidBy)
      if (!out.has(id))
        out.set(id, { total: 0, paid: round2(p), balance: round2(-p) });
    return out;
  }

  async billPdf(actor: PartnerActor, admissionId: string) {
    this.need(actor, CAN_SEE, 'print bills');
    const a = await this.loadAdmission(actor, admissionId);
    const s = await this.summary(actor, a);
    const buffer = this.documents.admissionBillPdf(
      a,
      actor.provider,
      await this.documents.brand(actor.provider),
      {
        hospitalNo: s.hospitalNo,
        lines: s.charges
          .filter((c) => !c.voidedAt)
          .map((c) => ({ ...c, givenAt: new Date(c.givenAt) })),
        subtotal: s.subtotal,
        tax: s.tax,
        total: s.total,
        payments: s.payments.map((p) => ({
          ...p,
          receivedAt: new Date(p.receivedAt),
        })),
        paid: s.paid,
        balance: s.balance,
      },
    );
    return { buffer, fileName: `Bill ${a.admissionNo}.pdf` };
  }

  /** The discharge summary as a PDF to print, for any discharged admission (walk-ins included). */
  async dischargeSummaryPdf(actor: PartnerActor, admissionId: string) {
    const a = await this.loadAdmission(actor, admissionId);
    if (!a.dischargedAt)
      throw new BadRequestException(
        'The discharge summary is ready once the patient is discharged',
      );
    const buffer = this.documents.dischargeSummaryPdf(
      a,
      actor.provider,
      await this.documents.brand(actor.provider),
    );
    return { buffer, fileName: `Discharge summary ${a.admissionNo}.pdf` };
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async summary(actor: PartnerActor, a: AdmissionDocument) {
    const [charges, payments, intake] = await Promise.all([
      this.chargeModel
        .find({ providerId: actor.provider._id, admissionId: a._id })
        .sort({ givenAt: 1, createdAt: 1 })
        .exec(),
      this.paymentModel
        .find({
          providerId: actor.provider._id,
          admissionId: a._id,
          voidedAt: { $exists: false },
        })
        .sort({ receivedAt: 1 })
        .exec(),
      a.patientId
        ? this.intakeModel
            .findOne({ providerId: actor.provider._id, patientId: a.patientId })
            .select('hospitalNo')
            .lean()
            .exec()
        : null,
    ]);
    const live = charges.filter((c) => !c.voidedAt);
    const subtotal = round2(live.reduce((n, c) => n + c.amount, 0));
    const tax = round2(live.reduce((n, c) => n + c.tax, 0));
    const total = round2(subtotal + tax);
    const paid = round2(payments.reduce((n, p) => n + p.total, 0));
    return {
      admissionId: a.id,
      admissionNo: a.admissionNo,
      patientName: a.patientName,
      hospitalNo: intake?.hospitalNo ?? null,
      discharged: !!a.dischargedAt,
      charges: charges.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        unit: c.unit,
        unitPrice: c.unitPrice,
        quantity: c.quantity,
        taxPct: c.taxPct,
        amount: c.amount,
        tax: c.tax,
        total: c.total,
        givenAt: c.givenAt.toISOString(),
        note: c.note ?? null,
        addedByName: c.addedByName ?? null,
        fromPriceList: !!c.serviceId,
        voidedAt: c.voidedAt?.toISOString() ?? null,
        voidedByName: c.voidedByName ?? null,
        voidReason: c.voidReason ?? null,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        receiptNo: p.receiptNo,
        receivedAt: p.receivedAt.toISOString(),
        methods: p.parts.map((x) => x.method.replace(/_/g, ' ')).join(' + '),
        total: p.total,
      })),
      subtotal,
      tax,
      total,
      paid,
      balance: round2(total - paid),
    };
  }

  private priceView(p: PartnerServicePriceDocument) {
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      unit: p.unit,
      taxPct: p.taxPct,
      active: p.active,
    };
  }

  private async loadAdmission(actor: PartnerActor, id: string) {
    const a = await this.admissionModel
      .findOne({ _id: this.id(id), providerId: actor.provider._id })
      .exec();
    if (!a) throw new NotFoundException('Admission not found');
    return a;
  }

  private need(actor: PartnerActor, anyOf: Perm[], what: string) {
    if (!actor.permissions.some((p) => anyOf.includes(p)))
      throw new ForbiddenException(`Your role can't ${what}`);
  }

  private id(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
    return new Types.ObjectId(id);
  }

  private record(
    actor: PartnerActor,
    action: AuditAction,
    targetType: string,
    targetId: string,
    label: string,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action,
      targetType,
      targetId,
      metadata: { providerId: actor.provider.id, label },
    });
  }
}
