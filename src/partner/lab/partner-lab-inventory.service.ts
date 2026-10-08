import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PartnerActor } from '../rbac/partner-perm.guard';
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

/** Inventory Management: reagent/consumable stock, reorder levels and expiry. */
@Injectable()
export class PartnerLabInventoryService {
  constructor(
    @InjectModel(LabInventoryItem.name)
    private readonly itemModel: Model<LabInventoryItemDocument>,
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
        k === 'expiryDate' ? (v ? new Date(v as string) : undefined) : v,
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
