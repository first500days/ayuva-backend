import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WHATSAPP_SENDER } from '../../notifications/sms/whatsapp-sender';
import type { WhatsAppSender } from '../../notifications/sms/whatsapp-sender';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  reorderMessage,
  reorderRef,
  suggestedReorder,
  whatsAppLink,
  whatsAppNumber,
} from '../hospital/supplier-reorder';
import {
  LabCatalogItem,
  LabCatalogItemDocument,
} from './schemas/lab-catalog-item.schema';
import {
  LabInventoryItem,
  LabInventoryItemDocument,
} from './schemas/lab-inventory-item.schema';
import {
  AdjustStockDto,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from './dto/lab.dto';

const MOVEMENTS_KEPT = 50;
const EXPIRY_WARNING_DAYS = 30;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** "" or nothing clears the number; anything else must make a valid WhatsApp number. */
function supplierPhone(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const e164 = whatsAppNumber(raw);
  if (!e164)
    throw new BadRequestException(
      "Enter the supplier's WhatsApp number with country code, e.g. +91 98123 45678",
    );
  return e164;
}

/** Inventory Management: reagent/consumable stock, reorder levels and expiry. */
@Injectable()
export class PartnerLabInventoryService {
  constructor(
    @InjectModel(LabInventoryItem.name)
    private readonly itemModel: Model<LabInventoryItemDocument>,
    @InjectModel(LabCatalogItem.name)
    private readonly catalogModel: Model<LabCatalogItemDocument>,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: WhatsAppSender,
  ) {}

  async list(actor: PartnerActor) {
    const items = await this.itemModel
      .find({ providerId: actor.provider._id })
      .sort({ name: 1 })
      .exec();
    return items.map((i) => this.toResponse(i));
  }

  async create(actor: PartnerActor, dto: CreateInventoryItemDto) {
    const quantity = dto.quantity ?? 0;
    const item = await this.itemModel.create({
      ...dto,
      supplierWhatsapp: supplierPhone(dto.supplierWhatsapp),
      providerId: actor.provider._id,
      quantity,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      movements: quantity
        ? [
            {
              at: new Date(),
              delta: quantity,
              reason: 'received',
              note: 'Opening stock',
              byName: actor.member.fullName,
              balance: quantity,
            },
          ]
        : [],
    });
    return this.toResponse(item);
  }

  async update(actor: PartnerActor, id: string, dto: UpdateInventoryItemDto) {
    const item = await this.load(actor, id);
    for (const [k, v] of Object.entries(dto)) {
      if (v === undefined) continue;
      item.set(
        k,
        k === 'expiryDate'
          ? v
            ? new Date(v as string)
            : undefined
          : k === 'supplierWhatsapp'
            ? supplierPhone(v as string)
            : v,
      );
    }
    await item.save();
    return this.toResponse(item);
  }

  async adjust(actor: PartnerActor, id: string, dto: AdjustStockDto) {
    const item = await this.load(actor, id);
    const next = item.quantity + dto.delta;
    if (next < 0)
      throw new BadRequestException(
        `Only ${item.quantity} ${item.unit} in stock`,
      );
    item.quantity = next;
    item.movements.push({
      at: new Date(),
      delta: dto.delta,
      reason: dto.reason,
      note: dto.note,
      byName: actor.member.fullName,
      balance: next,
    });
    if (item.movements.length > MOVEMENTS_KEPT)
      item.movements.splice(0, item.movements.length - MOVEMENTS_KEPT);
    await item.save();
    return this.toResponse(item);
  }

  async remove(actor: PartnerActor, id: string) {
    const item = await this.load(actor, id);
    await item.deleteOne();
    return { id, removed: true };
  }

  /**
   * Takes the reagents and consumables these tests use (from the Test Catalog's
   * "uses per run") out of inventory, once per order and test. Called when a
   * test's results are complete, whether an analyser sent them or a person
   * typed them. Stock never goes below zero; a shortfall is noted on the
   * movement. Returns the items now at or below their reorder level.
   */
  async consumeForTests(
    actor: PartnerActor,
    orderNo: string,
    testIds: string[],
  ) {
    const ids = testIds.filter((t) => Types.ObjectId.isValid(t));
    if (!ids.length) return [];
    const tests = await this.catalogModel
      .find({ _id: { $in: ids }, providerId: actor.provider._id })
      .select('name consumes')
      .lean()
      .exec();
    const use = new Map<string, { quantity: number; tests: string[] }>();
    for (const t of tests)
      for (const c of t.consumes ?? []) {
        const k = c.itemId.toString();
        const cur = use.get(k) ?? { quantity: 0, tests: [] };
        cur.quantity += c.quantity;
        cur.tests.push(t.name);
        use.set(k, cur);
      }
    if (!use.size) return [];
    const items = await this.itemModel
      .find({ _id: { $in: [...use.keys()] }, providerId: actor.provider._id })
      .exec();
    const low: ReturnType<PartnerLabInventoryService['toResponse']>[] = [];
    for (const item of items) {
      const u = use.get(item.id)!;
      const take = Math.min(item.quantity, round3(u.quantity));
      const short = round3(u.quantity - take);
      const wasLow = item.quantity <= item.reorderLevel;
      item.quantity = round3(item.quantity - take);
      item.movements.push({
        at: new Date(),
        delta: -take,
        reason: 'used',
        note: `${orderNo}: ${[...new Set(u.tests)].join(', ')} (automatic)${short > 0 ? ` — ${short} ${item.unit} short, stock count needs checking` : ''}`,
        byName: actor.member.fullName,
        balance: item.quantity,
      });
      if (item.movements.length > MOVEMENTS_KEPT)
        item.movements.splice(0, item.movements.length - MOVEMENTS_KEPT);
      await item.save();
      if (!wasLow && item.quantity <= item.reorderLevel)
        low.push(this.toResponse(item));
    }
    return low;
  }

  /**
   * One click on a low-stock row: asks the supplier for more on WhatsApp (or
   * returns a wa.me link with the order typed in when the Business API isn't set up).
   */
  async reorder(actor: PartnerActor, id: string, quantity?: number) {
    const item = await this.load(actor, id);
    const to = whatsAppNumber(item.supplierWhatsapp);
    if (!to)
      throw new BadRequestException(
        `Add the supplier's WhatsApp number to ${item.name} first`,
      );
    const qty = quantity ?? suggestedReorder(item.quantity, item.reorderLevel);
    const now = new Date();
    const ref = reorderRef(now);
    const message = reorderMessage({
      orgName: actor.provider.name,
      item: [item.name, item.sku && `(${item.sku})`].filter(Boolean).join(' '),
      quantity: qty,
      unit: item.unit,
      ref,
    });
    const sent = this.whatsapp.live && (await this.whatsapp.send(to, message));
    item.lastReorder = {
      at: now,
      quantity: qty,
      ref,
      byName: actor.member.fullName,
      sent,
    };
    await item.save();
    return {
      sent,
      ref,
      quantity: qty,
      message,
      supplier: item.supplier ?? null,
      link: whatsAppLink(to, message),
      item: this.toResponse(item),
    };
  }

  async alerts(providerId: Types.ObjectId) {
    const soon = new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000);
    const [lowStock, expiringSoon] = await Promise.all([
      this.itemModel.countDocuments({
        providerId,
        $expr: { $lte: ['$quantity', '$reorderLevel'] },
      }),
      this.itemModel.countDocuments({ providerId, expiryDate: { $lte: soon } }),
    ]);
    return { lowStock, expiringSoon };
  }

  private async load(actor: PartnerActor, id: string) {
    const item = Types.ObjectId.isValid(id)
      ? await this.itemModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  toResponse(i: LabInventoryItemDocument) {
    const soon = Date.now() + EXPIRY_WARNING_DAYS * 86_400_000;
    return {
      id: i.id,
      name: i.name,
      sku: i.sku ?? null,
      category: i.category,
      unit: i.unit,
      quantity: i.quantity,
      reorderLevel: i.reorderLevel,
      lowStock: i.quantity <= i.reorderLevel,
      expiryDate: i.expiryDate?.toISOString().slice(0, 10) ?? null,
      expired: !!i.expiryDate && i.expiryDate.getTime() < Date.now(),
      expiringSoon: !!i.expiryDate && i.expiryDate.getTime() <= soon,
      lotNumber: i.lotNumber ?? null,
      supplier: i.supplier ?? null,
      supplierWhatsapp: i.supplierWhatsapp ?? null,
      lastReorder: i.lastReorder
        ? {
            at: i.lastReorder.at.toISOString(),
            quantity: i.lastReorder.quantity,
            ref: i.lastReorder.ref,
            byName: i.lastReorder.byName ?? null,
            sent: i.lastReorder.sent,
          }
        : null,
      location: i.location ?? null,
      movements: [...i.movements]
        .reverse()
        .slice(0, 10)
        .map((m) => ({
          at: m.at.toISOString(),
          delta: m.delta,
          reason: m.reason,
          note: m.note ?? null,
          byName: m.byName ?? null,
          balance: m.balance ?? null,
        })),
      updatedAt: (i.updatedAt ?? new Date()).toISOString(),
    };
  }
}
