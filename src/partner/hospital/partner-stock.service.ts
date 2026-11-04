import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  StockBatch,
  StockItem,
  StockItemDocument,
  StoreKind,
} from './schemas/stock-item.schema';
import {
  StockMove,
  StockMoveDocument,
  StockReason,
  StockRef,
} from './schemas/stock-move.schema';
import {
  AdjustStockDto,
  CreateStockItemDto,
  ReceiveStockDto,
  StockItemsQueryDto,
  StockMovesQueryDto,
  UpdateStockItemDto,
} from './dto/stores.dto';
import {
  BatchLike,
  BatchPick,
  expiryState,
  isUsable,
  planIssue,
  usableQuantity,
} from './stock';

const STORE_LABEL: Record<StoreKind, string> = {
  [StoreKind.PHARMACY]: 'pharmacy',
  [StoreKind.CENTRAL]: 'central supply',
};

export interface TakenStock {
  item: StockItemDocument;
  picks: (BatchPick & { mrp?: number; serials?: string[] })[];
  /** Puts the units back (used when a later step of the same action fails). */
  undo: () => Promise<void>;
}

export interface IssueContext {
  reason: Extract<StockReason, 'dispensed' | 'issued'>;
  ref?: StockRef;
  patientName?: string;
  note?: string;
}

/**
 * The stock engine behind the hospital Pharmacy and Central Supply: items
 * with batches, receipts, first-expiry-first-out issues and an append-only
 * ledger. Every change to a batch and the item total is one atomic update,
 * conditional on the stock still being there, so two people issuing at the
 * same time can never take the count below zero.
 */
@Injectable()
export class PartnerStockService {
  constructor(
    @InjectModel(StockItem.name)
    private readonly itemModel: Model<StockItemDocument>,
    @InjectModel(StockMove.name)
    private readonly moveModel: Model<StockMoveDocument>,
    private readonly audit: AuditLogService,
  ) {}

  // ── Items ─────────────────────────────────────────────────────────────────

  async list(actor: PartnerActor, store: StoreKind, q: StockItemsQueryDto) {
    const filter: QueryFilter<StockItemDocument> = {
      providerId: actor.provider._id,
      store,
    };
    if (!q.includeInactive) filter.active = true;
    if (q.q?.trim()) {
      const rx = buildSafeRegex(q.q);
      filter.$or = [{ name: rx }, { genericName: rx }, { code: rx }];
    }
    const items = await this.itemModel
      .find(filter)
      .sort({ name: 1 })
      .limit(2000)
      .exec();
    const today = new Date();
    return items.map((i) => this.toResponse(i, today));
  }

  async create(actor: PartnerActor, store: StoreKind, dto: CreateStockItemDto) {
    const exact = new RegExp(`^${escape(dto.name)}$`, 'i');
    if (
      await this.itemModel.exists({
        providerId: actor.provider._id,
        store,
        name: exact,
        // null matches a missing field: "no strength" only clashes with "no strength".
        strength: dto.strength || null,
        form: dto.form || null,
      })
    )
      throw new ConflictException(
        `${dto.name} is already in the ${STORE_LABEL[store]} list`,
      );
    const pharmacy = store === StoreKind.PHARMACY;
    const item = await this.itemModel.create({
      providerId: actor.provider._id,
      store,
      name: dto.name,
      code: dto.code || undefined,
      genericName: pharmacy ? dto.genericName || undefined : undefined,
      form: dto.form || undefined,
      strength: dto.strength || undefined,
      schedule: pharmacy ? dto.schedule : undefined,
      category: pharmacy ? 'medicine' : (dto.category ?? 'consumable'),
      serialised: !pharmacy && !!dto.serialised,
      unit: dto.unit || 'units',
      reorderLevel: dto.reorderLevel ?? 0,
      location: dto.location || undefined,
    });
    await this.record(actor, item, { change: 'item_added' });
    return this.toResponse(item, new Date());
  }

  async update(
    actor: PartnerActor,
    store: StoreKind,
    id: string,
    dto: UpdateStockItemDto,
  ) {
    const item = await this.load(actor, store, id);
    const pharmacy = store === StoreKind.PHARMACY;
    const changed: string[] = [];
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      if (pharmacy && k === 'category') continue;
      if (!pharmacy && (k === 'schedule' || k === 'genericName')) continue;
      item.set(k, typeof v === 'string' && v === '' ? undefined : v);
      changed.push(k);
    }
    await item.save();
    if (changed.length)
      await this.record(actor, item, {
        change: 'item_updated',
        fields: changed,
      });
    return this.toResponse(item, new Date());
  }

  // ── Receipts & corrections ────────────────────────────────────────────────

  async receive(
    actor: PartnerActor,
    store: StoreKind,
    id: string,
    dto: ReceiveStockDto,
  ) {
    const item = await this.load(actor, store, id);
    if (!item.active)
      throw new BadRequestException(
        `${item.name} is archived — restore it before receiving stock`,
      );
    const serials = this.checkNewSerials(item, dto.serials, dto.quantity);
    const expiry = dto.expiryDate ? dayDate(dto.expiryDate) : undefined;
    if (expiry && expiryState(expiry, new Date()) === 'expired')
      throw new BadRequestException(
        `Batch ${dto.batchNo} has already expired — it can't be received into stock`,
      );
    const existing = item.batches.find(
      (b) => b.batchNo.toLowerCase() === dto.batchNo.toLowerCase(),
    );
    if (existing) {
      const same =
        (existing.expiryDate?.getTime() ?? null) ===
        (expiry?.getTime() ?? null);
      if (!same)
        throw new BadRequestException(
          `Batch ${existing.batchNo} is already in stock with ${
            existing.expiryDate
              ? `expiry ${existing.expiryDate.toISOString().slice(0, 10)}`
              : 'no expiry date'
          } — check the batch number`,
        );
      await this.itemModel.updateOne(
        {
          _id: item._id,
          providerId: actor.provider._id,
          'batches._id': existing._id,
        },
        {
          $inc: { 'batches.$.quantity': dto.quantity, quantity: dto.quantity },
          ...(serials && {
            $push: { 'batches.$.serials': { $each: serials } },
          }),
        },
      );
    } else {
      await this.itemModel.updateOne(
        { _id: item._id, providerId: actor.provider._id },
        {
          $push: {
            batches: {
              batchNo: dto.batchNo,
              expiryDate: expiry,
              quantity: dto.quantity,
              unitCost: dto.unitCost,
              mrp: dto.mrp,
              supplier: dto.supplier || undefined,
              invoiceNo: dto.invoiceNo || undefined,
              receivedAt: new Date(),
              serials,
            },
          },
          $inc: { quantity: dto.quantity },
        },
      );
    }
    const fresh = await this.load(actor, store, id);
    await this.moveModel.create({
      providerId: actor.provider._id,
      store,
      itemId: item._id,
      itemName: item.name,
      batchNo: existing?.batchNo ?? dto.batchNo,
      expiryDate: expiry,
      delta: dto.quantity,
      balance: fresh.quantity,
      reason: 'received',
      ref: dto.supplier
        ? {
            type: 'supplier',
            label: dto.invoiceNo
              ? `${dto.supplier} · ${dto.invoiceNo}`
              : dto.supplier,
          }
        : undefined,
      serials,
      byMemberId: actor.member._id,
      byName: actor.member.fullName,
    });
    await this.record(actor, fresh, {
      change: 'received',
      quantity: dto.quantity,
      batchNo: dto.batchNo,
    });
    return this.toResponse(fresh, new Date());
  }

  async adjust(
    actor: PartnerActor,
    store: StoreKind,
    id: string,
    dto: AdjustStockDto,
  ) {
    if (dto.delta === 0)
      throw new BadRequestException('Enter how many units to add or remove');
    if (dto.delta > 0 && dto.reason !== 'adjusted')
      throw new BadRequestException(
        'Only a count correction can add units — receive new stock as a delivery',
      );
    const item = await this.load(actor, store, id);
    const batch = item.batches.find((b) => b._id.toString() === dto.batchId);
    if (!batch) throw new NotFoundException('Batch not found');
    const count = Math.abs(dto.delta);
    let serials: string[] | undefined;
    if (item.serialised) {
      serials = [
        ...new Set((dto.serials ?? []).map((s) => s.trim()).filter(Boolean)),
      ];
      if (serials.length !== count)
        throw new BadRequestException(
          `List the ${count} serial number${count === 1 ? '' : 's'} being ${dto.delta > 0 ? 'added' : 'removed'}`,
        );
      if (dto.delta > 0) this.checkNewSerials(item, serials, count);
      else if (serials.some((s) => !(batch.serials ?? []).includes(s)))
        throw new BadRequestException(
          `Those serial numbers aren't in batch ${batch.batchNo}`,
        );
    }
    const res = await this.itemModel.updateOne(
      {
        _id: item._id,
        providerId: actor.provider._id,
        batches: {
          $elemMatch: {
            _id: batch._id,
            ...(dto.delta < 0 && { quantity: { $gte: count } }),
            ...(dto.delta < 0 && serials && { serials: { $all: serials } }),
          },
        },
      },
      {
        $inc: { 'batches.$.quantity': dto.delta, quantity: dto.delta },
        ...(serials &&
          (dto.delta > 0
            ? { $push: { 'batches.$.serials': { $each: serials } } }
            : { $pullAll: { 'batches.$.serials': serials } })),
      },
    );
    if (res.modifiedCount !== 1)
      throw new ConflictException(
        `Batch ${batch.batchNo} has only ${batch.quantity} ${item.unit} — refresh and try again`,
      );
    const fresh = await this.load(actor, store, id);
    await this.moveModel.create({
      providerId: actor.provider._id,
      store,
      itemId: item._id,
      itemName: item.name,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      delta: dto.delta,
      balance: fresh.quantity,
      reason: dto.reason,
      serials,
      note: dto.note,
      byMemberId: actor.member._id,
      byName: actor.member.fullName,
    });
    await this.record(actor, fresh, {
      change: dto.reason,
      delta: dto.delta,
      batchNo: batch.batchNo,
    });
    return this.toResponse(fresh, new Date());
  }

  // ── Issues ────────────────────────────────────────────────────────────────

  /**
   * Takes `quantity` units out of an item: first-expiry-first-out (or the
   * listed serial numbers), never from an expired batch. Writes nothing to
   * the ledger — call `recordIssue` once the whole action has succeeded, or
   * `undo` to put the units back.
   */
  async take(
    actor: PartnerActor,
    store: StoreKind,
    itemId: string,
    quantity: number,
    opts: { batchId?: string; serials?: string[] } = {},
  ): Promise<TakenStock> {
    const item = await this.load(actor, store, itemId);
    if (!item.active) throw new BadRequestException(`${item.name} is archived`);
    const today = new Date();
    let picks: TakenStock['picks'];
    if (item.serialised) {
      const serials = [
        ...new Set((opts.serials ?? []).map((s) => s.trim()).filter(Boolean)),
      ];
      if (serials.length !== quantity)
        throw new BadRequestException(
          `${item.name} is tracked by serial number — pick the ${quantity} serial${quantity === 1 ? '' : 's'} being issued`,
        );
      const byBatch = new Map<string, string[]>();
      for (const s of serials) {
        const b = item.batches.find((x) => (x.serials ?? []).includes(s));
        if (!b) throw new BadRequestException(`Serial ${s} isn't in stock`);
        if (!isUsable(asBatch(b), today))
          throw new BadRequestException(
            `Serial ${s} is from batch ${b.batchNo}, which has expired`,
          );
        byBatch.set(b._id.toString(), [
          ...(byBatch.get(b._id.toString()) ?? []),
          s,
        ]);
      }
      picks = [...byBatch.entries()].map(([batchId, list]) => {
        const b = item.batches.find((x) => x._id.toString() === batchId)!;
        return {
          batchId,
          batchNo: b.batchNo,
          expiryDate: b.expiryDate ?? null,
          quantity: list.length,
          mrp: b.mrp,
          serials: list,
        };
      });
    } else {
      const plan = planIssue(
        item.batches.map(asBatch),
        quantity,
        today,
        opts.batchId,
      );
      if (plan.short > 0) {
        const usable = usableQuantity(item.batches.map(asBatch), today);
        throw new BadRequestException(
          `Only ${usable} ${item.unit} of ${item.name} can be issued${
            usable < item.quantity ? ' (the rest has expired)' : ''
          }`,
        );
      }
      picks = plan.picks.map((p) => ({
        ...p,
        mrp: item.batches.find((b) => b._id.toString() === p.batchId)?.mrp,
      }));
    }

    const applied: TakenStock['picks'] = [];
    const undo = async () => {
      for (const p of applied.reverse())
        await this.itemModel.updateOne(
          { _id: item._id, 'batches._id': new Types.ObjectId(p.batchId) },
          {
            $inc: { 'batches.$.quantity': p.quantity, quantity: p.quantity },
            ...(p.serials && {
              $push: { 'batches.$.serials': { $each: p.serials } },
            }),
          },
        );
    };
    for (const p of picks) {
      const res = await this.itemModel.updateOne(
        {
          _id: item._id,
          providerId: actor.provider._id,
          batches: {
            $elemMatch: {
              _id: new Types.ObjectId(p.batchId),
              quantity: { $gte: p.quantity },
              ...(p.serials && { serials: { $all: p.serials } }),
            },
          },
        },
        {
          $inc: { 'batches.$.quantity': -p.quantity, quantity: -p.quantity },
          ...(p.serials && { $pullAll: { 'batches.$.serials': p.serials } }),
        },
      );
      if (res.modifiedCount !== 1) {
        await undo();
        throw new ConflictException(
          `The stock of ${item.name} changed while you were working — refresh and try again`,
        );
      }
      applied.push(p);
    }
    return { item, picks, undo };
  }

  /** Ledger rows for a completed issue (one per batch). */
  async recordIssue(
    actor: PartnerActor,
    store: StoreKind,
    taken: TakenStock,
    ctx: IssueContext,
  ) {
    const fresh = await this.itemModel
      .findById(taken.item._id, { quantity: 1 })
      .lean()
      .exec();
    let balance = fresh?.quantity ?? 0;
    const rows = [...taken.picks].reverse().map((p) => {
      const row = {
        providerId: actor.provider._id,
        store,
        itemId: taken.item._id,
        itemName: taken.item.name,
        batchNo: p.batchNo,
        expiryDate: p.expiryDate ?? undefined,
        delta: -p.quantity,
        balance,
        reason: ctx.reason,
        ref: ctx.ref,
        serials: p.serials,
        patientName: ctx.patientName,
        note: ctx.note,
        byMemberId: actor.member._id,
        byName: actor.member.fullName,
      };
      balance += p.quantity;
      return row;
    });
    await this.moveModel.insertMany(rows.reverse());
  }

  // ── Ledger ────────────────────────────────────────────────────────────────

  async moves(actor: PartnerActor, store: StoreKind, q: StockMovesQueryDto) {
    const filter: QueryFilter<StockMoveDocument> = {
      providerId: actor.provider._id,
      store,
    };
    if (q.itemId) filter.itemId = new Types.ObjectId(q.itemId);
    if (q.reason) filter.reason = q.reason;
    if (q.from || q.to)
      filter.createdAt = {
        ...(q.from && { $gte: new Date(q.from) }),
        ...(q.to && { $lte: new Date(q.to) }),
      };
    const rows = await this.moveModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(q.limit ?? 200)
      .lean()
      .exec();
    return rows.map((m) => ({
      id: m._id.toString(),
      at: m.createdAt?.toISOString() ?? null,
      itemId: m.itemId.toString(),
      itemName: m.itemName,
      batchNo: m.batchNo ?? null,
      expiryDate: m.expiryDate?.toISOString() ?? null,
      delta: m.delta,
      balance: m.balance,
      reason: m.reason,
      ref: m.ref
        ? { type: m.ref.type, id: m.ref.id ?? null, label: m.ref.label }
        : null,
      serials: m.serials ?? [],
      patientName: m.patientName ?? null,
      note: m.note ?? null,
      byName: m.byName ?? null,
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async load(actor: PartnerActor, store: StoreKind, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Item not found');
    const item = await this.itemModel
      .findOne({ _id: id, providerId: actor.provider._id, store })
      .exec();
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  private checkNewSerials(
    item: StockItemDocument,
    list: string[] | undefined,
    quantity: number,
  ) {
    if (!item.serialised) {
      if (list?.length)
        throw new BadRequestException(
          `${item.name} isn't tracked by serial number`,
        );
      return undefined;
    }
    const serials = [
      ...new Set((list ?? []).map((s) => s.trim()).filter(Boolean)),
    ];
    if (serials.length !== quantity)
      throw new BadRequestException(
        `${item.name} is tracked by serial number — enter one serial per unit (${quantity})`,
      );
    const held = new Set(item.batches.flatMap((b) => b.serials ?? []));
    const dup = serials.find((s) => held.has(s));
    if (dup) throw new BadRequestException(`Serial ${dup} is already in stock`);
    return serials;
  }

  toResponse(i: StockItemDocument, today: Date) {
    const batches = i.batches
      .filter((b) => b.quantity > 0)
      .map((b) => ({ b, state: expiryState(b.expiryDate, today) }))
      .sort(
        (x, y) =>
          (x.b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY) -
          (y.b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY),
      );
    const usable = usableQuantity(i.batches.map(asBatch), today);
    const qtyIn = (state: string) =>
      batches
        .filter((x) => x.state === state)
        .reduce((n, x) => n + x.b.quantity, 0);
    const nextExpiry = batches.find(
      (x) => x.state !== 'expired' && x.b.expiryDate,
    )?.b.expiryDate;
    return {
      id: i.id,
      store: i.store,
      name: i.name,
      code: i.code ?? null,
      genericName: i.genericName ?? null,
      form: i.form ?? null,
      strength: i.strength ?? null,
      schedule: i.schedule ?? null,
      category: i.category,
      serialised: i.serialised,
      unit: i.unit,
      reorderLevel: i.reorderLevel,
      location: i.location ?? null,
      active: i.active,
      quantity: i.quantity,
      usable,
      low: usable <= i.reorderLevel,
      expiredQuantity: qtyIn('expired'),
      expiringQuantity: qtyIn('expiring'),
      nextExpiry: nextExpiry?.toISOString() ?? null,
      value:
        Math.round(
          batches.reduce((n, x) => n + x.b.quantity * (x.b.unitCost ?? 0), 0) *
            100,
        ) / 100,
      batches: batches.map(({ b, state }) => ({
        id: b._id.toString(),
        batchNo: b.batchNo,
        expiryDate: b.expiryDate?.toISOString() ?? null,
        state,
        quantity: b.quantity,
        unitCost: b.unitCost ?? null,
        mrp: b.mrp ?? null,
        supplier: b.supplier ?? null,
        invoiceNo: b.invoiceNo ?? null,
        receivedAt: b.receivedAt.toISOString(),
        serials: b.serials ?? [],
      })),
      updatedAt: i.updatedAt?.toISOString() ?? null,
    };
  }

  private record(
    actor: PartnerActor,
    item: StockItemDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_STOCK_UPDATE,
      targetType: 'StockItem',
      targetId: item.id,
      metadata: {
        providerId: actor.provider.id,
        label: `${item.name} (${STORE_LABEL[item.store]})`,
        store: item.store,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }
}

function asBatch(b: StockBatch): BatchLike {
  return {
    id: b._id.toString(),
    batchNo: b.batchNo,
    expiryDate: b.expiryDate ?? null,
    quantity: b.quantity,
    receivedAt: b.receivedAt,
  };
}

/** A YYYY-MM-DD date as local midnight (expiry is a calendar date). */
function dayDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
