import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  AssetDocument,
  AssetStatus,
  PartnerAsset,
} from './schemas/asset.schema';
import {
  CreateAssetDto,
  LogMaintenanceDto,
  UpdateAssetDto,
} from './dto/stores.dto';
import { dueState, nextDue } from './asset-schedule';

const DAY = 24 * 60 * 60 * 1000;
const STATUS_ORDER: Record<AssetStatus, number> = {
  [AssetStatus.OUT_OF_SERVICE]: 0,
  [AssetStatus.MAINTENANCE]: 1,
  [AssetStatus.OPERATIONAL]: 2,
  [AssetStatus.CONDEMNED]: 3,
};

const DATE_FIELDS = ['purchasedAt', 'warrantyUntil', 'amcUntil'] as const;

/** Central Supply → Equipment: register, preventive maintenance, calibration, breakdowns. */
@Injectable()
export class PartnerAssetsService {
  constructor(
    @InjectModel(PartnerAsset.name)
    private readonly assetModel: Model<AssetDocument>,
    private readonly audit: AuditLogService,
  ) {}

  async list(actor: PartnerActor) {
    const assets = await this.assetModel
      .find({ providerId: actor.provider._id })
      .sort({ name: 1 })
      .limit(5000)
      .exec();
    const today = new Date();
    return assets
      .map((a) => this.toResponse(a, today))
      .sort(
        (x, y) =>
          STATUS_ORDER[x.status] - STATUS_ORDER[y.status] ||
          x.name.localeCompare(y.name),
      );
  }

  async create(actor: PartnerActor, dto: CreateAssetDto) {
    // The unique index backs this up; the check gives a clear message everywhere.
    if (
      await this.assetModel.exists({
        providerId: actor.provider._id,
        tag: dto.tag,
      })
    )
      throw new ConflictException(`Asset tag ${dto.tag} is already in use`);
    const last = dto.lastServiceAt ? new Date(dto.lastServiceAt) : undefined;
    const lastCal = dto.lastCalibratedAt
      ? new Date(dto.lastCalibratedAt)
      : undefined;
    try {
      const asset = await this.assetModel.create({
        providerId: actor.provider._id,
        tag: dto.tag,
        name: dto.name,
        category: dto.category ?? 'other',
        department: dto.department || undefined,
        location: dto.location || undefined,
        make: dto.make || undefined,
        modelNo: dto.modelNo || undefined,
        serialNo: dto.serialNo || undefined,
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : undefined,
        warrantyUntil: dto.warrantyUntil
          ? new Date(dto.warrantyUntil)
          : undefined,
        amcVendor: dto.amcVendor || undefined,
        amcUntil: dto.amcUntil ? new Date(dto.amcUntil) : undefined,
        serviceIntervalDays: dto.serviceIntervalDays || undefined,
        lastServiceAt: last,
        nextServiceDue: nextDue(last, dto.serviceIntervalDays),
        calibrationIntervalDays: dto.calibrationIntervalDays || undefined,
        lastCalibratedAt: lastCal,
        nextCalibrationDue: nextDue(lastCal, dto.calibrationIntervalDays),
      });
      await this.record(actor, asset, { change: 'asset_added' });
      return this.toResponse(asset, new Date());
    } catch (err) {
      if ((err as { code?: number }).code === 11000)
        throw new ConflictException(`Asset tag ${dto.tag} is already in use`);
      throw err;
    }
  }

  async update(actor: PartnerActor, id: string, dto: UpdateAssetDto) {
    const asset = await this.load(actor, id);
    const changed: string[] = [];
    for (const [k, v] of Object.entries(dto) as [string, unknown][]) {
      if (v === undefined) continue;
      if (k === 'status') continue;
      let value: unknown = v === '' ? undefined : v;
      if ((DATE_FIELDS as readonly string[]).includes(k))
        value = typeof v === 'string' && v ? new Date(v) : undefined;
      asset.set(k, value);
      changed.push(k);
    }
    if (dto.serviceIntervalDays !== undefined)
      asset.nextServiceDue = nextDue(
        asset.lastServiceAt,
        dto.serviceIntervalDays,
      );
    if (dto.calibrationIntervalDays !== undefined)
      asset.nextCalibrationDue = nextDue(
        asset.lastCalibratedAt,
        dto.calibrationIntervalDays,
      );
    if (dto.status && dto.status !== asset.status) {
      if (
        dto.status === AssetStatus.OPERATIONAL &&
        asset.status !== AssetStatus.CONDEMNED
      )
        throw new BadRequestException(
          'Log a service or repair to put equipment back in use',
        );
      asset.status = dto.status;
      changed.push(
        dto.status === AssetStatus.CONDEMNED ? 'condemned' : 'restored',
      );
    }
    await asset.save();
    if (changed.length)
      await this.record(actor, asset, {
        change: 'asset_updated',
        fields: changed,
      });
    return this.toResponse(asset, new Date());
  }

  async log(actor: PartnerActor, id: string, dto: LogMaintenanceDto) {
    const asset = await this.load(actor, id);
    if (asset.status === AssetStatus.CONDEMNED)
      throw new BadRequestException(
        `${asset.name} is condemned — restore it before logging work`,
      );
    const at = dto.at ? new Date(dto.at) : new Date();
    if (at.getTime() > Date.now() + 5 * 60 * 1000)
      throw new BadRequestException("Work can't be logged in the future");
    asset.logs.push({
      at,
      type: dto.type,
      summary: dto.summary,
      vendor: dto.vendor || undefined,
      engineer: dto.engineer || undefined,
      cost: dto.cost,
      downtimeHours: dto.downtimeHours,
      statusAfter: dto.statusAfter,
      byName: actor.member.fullName,
      loggedAt: new Date(),
    } as never);
    // A later-dated entry moves the schedule on; back-filled older work doesn't.
    if (
      dto.type === 'preventive' &&
      (!asset.lastServiceAt || at > asset.lastServiceAt)
    ) {
      asset.lastServiceAt = at;
      asset.nextServiceDue = nextDue(at, asset.serviceIntervalDays);
    }
    if (
      dto.type === 'calibration' &&
      (!asset.lastCalibratedAt || at > asset.lastCalibratedAt)
    ) {
      asset.lastCalibratedAt = at;
      asset.nextCalibrationDue = nextDue(at, asset.calibrationIntervalDays);
    }
    const before = asset.status;
    asset.status = dto.statusAfter;
    await asset.save();
    await this.record(actor, asset, {
      change: `maintenance_${dto.type}`,
      ...(before !== asset.status && { status: `${before} → ${asset.status}` }),
    });
    return this.toResponse(asset, new Date());
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async load(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Equipment not found');
    const asset = await this.assetModel
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!asset) throw new NotFoundException('Equipment not found');
    return asset;
  }

  private toResponse(a: AssetDocument, today: Date) {
    const cover = [a.warrantyUntil, a.amcUntil]
      .filter((d): d is Date => !!d)
      .sort((x, y) => y.getTime() - x.getTime())[0];
    const since = today.getTime() - 90 * DAY;
    const logs = [...a.logs].sort((x, y) => y.at.getTime() - x.at.getTime());
    const iso = (d?: Date) => d?.toISOString() ?? null;
    return {
      id: a.id,
      tag: a.tag,
      name: a.name,
      category: a.category,
      department: a.department ?? null,
      location: a.location ?? null,
      make: a.make ?? null,
      modelNo: a.modelNo ?? null,
      serialNo: a.serialNo ?? null,
      purchasedAt: iso(a.purchasedAt),
      warrantyUntil: iso(a.warrantyUntil),
      amcVendor: a.amcVendor ?? null,
      amcUntil: iso(a.amcUntil),
      coveredUntil: iso(cover),
      covered: !!cover && cover.getTime() >= today.getTime(),
      serviceIntervalDays: a.serviceIntervalDays ?? null,
      lastServiceAt: iso(a.lastServiceAt),
      nextServiceDue: iso(a.nextServiceDue),
      serviceState:
        a.status === AssetStatus.CONDEMNED
          ? 'none'
          : dueState(a.nextServiceDue, today),
      calibrationIntervalDays: a.calibrationIntervalDays ?? null,
      lastCalibratedAt: iso(a.lastCalibratedAt),
      nextCalibrationDue: iso(a.nextCalibrationDue),
      calibrationState:
        a.status === AssetStatus.CONDEMNED
          ? 'none'
          : dueState(a.nextCalibrationDue, today),
      status: a.status,
      downtimeHours90d: logs
        .filter((l) => l.at.getTime() >= since)
        .reduce((n, l) => n + (l.downtimeHours ?? 0), 0),
      logs: logs.slice(0, 50).map((l) => ({
        id: l._id.toString(),
        at: l.at.toISOString(),
        type: l.type,
        summary: l.summary,
        vendor: l.vendor ?? null,
        engineer: l.engineer ?? null,
        cost: l.cost ?? null,
        downtimeHours: l.downtimeHours ?? null,
        statusAfter: l.statusAfter ?? null,
        byName: l.byName ?? null,
      })),
    };
  }

  private record(
    actor: PartnerActor,
    asset: AssetDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_ASSET_UPDATE,
      targetType: 'PartnerAsset',
      targetId: asset.id,
      metadata: {
        providerId: actor.provider.id,
        label: `${asset.name} (${asset.tag})`,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }
}
