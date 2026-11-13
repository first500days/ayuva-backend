import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { LiveBus } from '../../common/live/live-bus.service';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  Prescription,
  PrescriptionDocument,
  PrescriptionStatus,
} from '../clinical/schemas/prescription.schema';
import {
  StockItem,
  StockItemDocument,
  StoreKind,
} from './schemas/stock-item.schema';
import {
  Dispense,
  DispenseDocument,
  DispenseLine,
} from './schemas/dispense.schema';
import { PartnerStockService, TakenStock } from './partner-stock.service';
import { DispenseDto, PharmacyQueueQueryDto } from './dto/stores.dto';
import { matchScore } from './medicine-match';
import { usableQuantity } from './stock';
import { dayKey } from './clock';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Pharmacy & Medication Management: the hospital's dispensing queue of
 * signed e-prescriptions written by its clinicians, and hand-overs from the
 * pharmacy store (first-expiry-first-out). A signed prescription is never
 * edited; what was supplied is kept in its own dispense records.
 */
@Injectable()
export class PartnerPharmacyService {
  constructor(
    @InjectModel(Prescription.name)
    private readonly rxModel: Model<PrescriptionDocument>,
    @InjectModel(Dispense.name)
    private readonly dispenseModel: Model<DispenseDocument>,
    @InjectModel(StockItem.name)
    private readonly itemModel: Model<StockItemDocument>,
    private readonly stock: PartnerStockService,
    private readonly audit: AuditLogService,
    private readonly live: LiveBus,
  ) {}

  async queue(actor: PartnerActor, q: PharmacyQueueQueryDto) {
    const filter: QueryFilter<PrescriptionDocument> = {
      providerId: actor.provider._id,
      status: PrescriptionStatus.SIGNED,
      signedAt: { $gte: new Date(Date.now() - (q.days ?? 30) * DAY) },
    };
    // Prescriptions the doctor sent to the pharmacy (and older ones, signed before the choice existed).
    const and: QueryFilter<PrescriptionDocument>[] = [
      {
        $or: [
          { dispatchTo: 'internal_pharmacy' },
          { dispatchTo: { $exists: false } },
        ],
      },
    ];
    if (q.q?.trim()) {
      const rx = buildSafeRegex(q.q);
      and.push({
        $or: [{ rxNumber: rx }, { patientName: rx }, { doctorName: rx }],
      });
    }
    filter.$and = and;
    const list = await this.rxModel
      .find(filter)
      .sort({ signedAt: -1 })
      .limit(300)
      .exec();
    const dispenses = await this.dispenseModel
      .find({
        providerId: actor.provider._id,
        prescriptionId: { $in: list.map((r) => r._id) },
      })
      .sort({ createdAt: 1 })
      .exec();
    const byRx = new Map<string, DispenseDocument[]>();
    for (const d of dispenses) {
      const k = d.prescriptionId.toString();
      byRx.set(k, [...(byRx.get(k) ?? []), d]);
    }
    const stock = await this.stockForMatching(actor);
    let rows = list.map((rx) => this.row(rx, byRx.get(rx.id) ?? [], stock));
    if (q.status === 'open')
      rows = rows.filter((r) => r.status !== 'dispensed');
    else if (q.status && q.status !== 'all')
      rows = rows.filter((r) => r.status === q.status);
    return rows;
  }

  async get(actor: PartnerActor, id: string) {
    const rx = await this.loadRx(actor, id);
    const dispenses = await this.dispenseModel
      .find({ prescriptionId: rx._id })
      .sort({ createdAt: 1 })
      .exec();
    return this.row(rx, dispenses, await this.stockForMatching(actor));
  }

  /** Pharmacy items whose name or generic matches, for choosing what to supply. */
  async search(actor: PartnerActor, q: string) {
    const rx = buildSafeRegex(q);
    const items = await this.itemModel
      .find({
        providerId: actor.provider._id,
        store: StoreKind.PHARMACY,
        active: true,
        $or: [{ name: rx }, { genericName: rx }, { code: rx }],
      })
      .sort({ name: 1 })
      .limit(20)
      .exec();
    const today = new Date();
    return items.map((i) => this.option(i, today));
  }

  async dispense(actor: PartnerActor, id: string, dto: DispenseDto) {
    const rx = await this.loadRx(actor, id);
    const before = await this.dispenseModel
      .find({ prescriptionId: rx._id })
      .exec();
    const current = this.row(rx, before, []);
    const seen = new Set<number>();
    for (const l of dto.lines) {
      const line = current.lines[l.rxIndex];
      if (!line)
        throw new BadRequestException(
          `Line ${l.rxIndex + 1} isn't on this prescription`,
        );
      if (seen.has(l.rxIndex))
        throw new BadRequestException(`Line ${l.rxIndex + 1} is listed twice`);
      seen.add(l.rxIndex);
      if (line.resolved)
        throw new ConflictException(
          `${line.medicine} has already been dispensed — refresh the queue`,
        );
      if (l.notSupplied) {
        if (l.quantity)
          throw new BadRequestException(
            `${line.medicine}: a line can't be supplied and not supplied`,
          );
      } else if (!l.itemId || !l.quantity) {
        throw new BadRequestException(
          `${line.medicine}: choose the stock item and quantity, or mark it not supplied`,
        );
      }
    }

    // Take every line's stock first; if any line fails, put back what was taken.
    const taken: { rxIndex: number; t: TakenStock }[] = [];
    try {
      for (const l of dto.lines) {
        if (l.notSupplied || !l.itemId || !l.quantity) continue;
        const t = await this.stock.take(
          actor,
          StoreKind.PHARMACY,
          l.itemId,
          l.quantity,
          {
            batchId: l.batchId,
          },
        );
        taken.push({ rxIndex: l.rxIndex, t });
      }
    } catch (err) {
      for (const { t } of taken.reverse()) await t.undo();
      throw err;
    }

    let amount = 0;
    const lines: DispenseLine[] = dto.lines.map((l) => {
      const prescribed = rx.items[l.rxIndex];
      const got = taken.find((x) => x.rxIndex === l.rxIndex)?.t;
      const batches = (got?.picks ?? []).map((p) => {
        if (p.mrp) amount += p.mrp * p.quantity;
        return {
          batchNo: p.batchNo,
          expiryDate: p.expiryDate ?? undefined,
          quantity: p.quantity,
          mrp: p.mrp,
        };
      });
      return {
        rxIndex: l.rxIndex,
        medicine: prescribed.medicine,
        itemId: got?.item._id,
        itemName: got?.item.name,
        quantity: batches.reduce((n, b) => n + b.quantity, 0),
        unit: got?.item.unit,
        batches,
        complete: l.notSupplied ? true : (l.complete ?? true),
        notSupplied: l.notSupplied,
        substituted: got
          ? matchScore(prescribed.medicine, prescribed.strength, got.item) < 2
          : false,
      };
    });

    let created: DispenseDocument;
    try {
      created = await this.dispenseModel.create({
        dispenseNo: dispenseNo(),
        providerId: actor.provider._id,
        prescriptionId: rx._id,
        rxNumber: rx.rxNumber,
        patientId: rx.patientId,
        patientName: rx.patientName,
        lines,
        amount: Math.round(amount * 100) / 100,
        note: dto.note || undefined,
        byMemberId: actor.member._id,
        byName: actor.member.fullName,
      });
    } catch (err) {
      for (const { t } of taken.reverse()) await t.undo();
      throw err;
    }
    for (const { t } of taken)
      await this.stock.recordIssue(actor, StoreKind.PHARMACY, t, {
        reason: 'dispensed',
        ref: { type: 'prescription', id: rx.id, label: rx.rxNumber ?? 'E-Rx' },
        patientName: rx.patientName,
      });
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_PHARMACY_DISPENSE,
      targetType: 'Prescription',
      targetId: rx.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: rx.patientId.toString(),
        label: `${rx.rxNumber} · ${created.dispenseNo}`,
        supplied: lines.filter((l) => l.quantity > 0).length,
        notSupplied: lines.filter((l) => l.notSupplied).length,
      },
      ipAddress: actor.ip,
    });
    this.live.publish(actor.provider._id, 'pharmacy');
    return this.row(
      rx,
      [...before, created],
      await this.stockForMatching(actor),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadRx(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Prescription not found');
    const rx = await this.rxModel
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!rx || rx.status === PrescriptionStatus.DRAFT)
      throw new NotFoundException('Prescription not found');
    if (rx.status === PrescriptionStatus.CANCELLED)
      throw new BadRequestException(
        `${rx.rxNumber} was cancelled by the doctor${rx.cancelReason ? `: ${rx.cancelReason}` : ''}`,
      );
    return rx;
  }

  private stockForMatching(actor: PartnerActor) {
    return this.itemModel
      .find({
        providerId: actor.provider._id,
        store: StoreKind.PHARMACY,
        active: true,
      })
      .limit(3000)
      .exec();
  }

  private option(i: StockItemDocument, today: Date) {
    const usable = usableQuantity(
      i.batches.map((b) => ({
        id: b._id.toString(),
        batchNo: b.batchNo,
        expiryDate: b.expiryDate ?? null,
        quantity: b.quantity,
        receivedAt: b.receivedAt,
      })),
      today,
    );
    return {
      itemId: i.id,
      name: i.name,
      genericName: i.genericName ?? null,
      form: i.form ?? null,
      strength: i.strength ?? null,
      schedule: i.schedule ?? null,
      unit: i.unit,
      usable,
    };
  }

  private row(
    rx: PrescriptionDocument,
    dispenses: DispenseDocument[],
    stock: StockItemDocument[],
  ) {
    const today = new Date();
    const lines = rx.items.map((it, index) => {
      const done = dispenses.flatMap((d) =>
        d.lines.filter((l) => l.rxIndex === index),
      );
      const supplied = done.reduce((n, l) => n + l.quantity, 0);
      const notSupplied = done.find((l) => l.notSupplied)?.notSupplied ?? null;
      const resolved = done.some((l) => l.complete || !!l.notSupplied);
      const suggestions = resolved
        ? []
        : stock
            .map((s) => ({ s, score: matchScore(it.medicine, it.strength, s) }))
            .filter((x) => x.score > 0)
            .sort(
              (a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name),
            )
            .slice(0, 3)
            .map((x) => ({ ...this.option(x.s, today), exact: x.score >= 2 }));
      return {
        index,
        medicine: it.medicine,
        form: it.form ?? null,
        strength: it.strength ?? null,
        dose: it.dose ?? null,
        frequency: it.frequency,
        duration: it.duration,
        route: it.route ?? null,
        instructions: it.instructions ?? null,
        quantity: it.quantity ?? null,
        supplied,
        resolved,
        notSupplied,
        suppliedAs: [
          ...new Set(done.map((l) => l.itemName).filter(Boolean)),
        ] as string[],
        suggestions,
      };
    });
    const status = lines.every((l) => l.resolved)
      ? 'dispensed'
      : lines.some((l) => l.resolved || l.supplied > 0)
        ? 'partial'
        : 'pending';
    return {
      id: rx.id,
      rxNumber: rx.rxNumber ?? null,
      signedAt: rx.signedAt?.toISOString() ?? null,
      patientId: rx.patientId.toString(),
      patientName: rx.patientName,
      doctorName: rx.doctorName,
      status,
      lines,
      dispenses: dispenses.map((d) => ({
        id: d.id,
        dispenseNo: d.dispenseNo,
        at: d.createdAt?.toISOString() ?? null,
        byName: d.byName ?? null,
        amount: d.amount,
        note: d.note ?? null,
        lines: d.lines.map((l) => ({
          rxIndex: l.rxIndex,
          medicine: l.medicine,
          itemName: l.itemName ?? null,
          quantity: l.quantity,
          unit: l.unit ?? null,
          batches: l.batches.map((b) => ({
            batchNo: b.batchNo,
            expiryDate: b.expiryDate?.toISOString() ?? null,
            quantity: b.quantity,
            mrp: b.mrp ?? null,
          })),
          complete: l.complete,
          notSupplied: l.notSupplied ?? null,
          substituted: l.substituted,
        })),
      })),
    };
  }
}

function dispenseNo() {
  return `DSP-${dayKey(new Date())}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
