import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { LiveBus } from '../../common/live/live-bus.service';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  AssetDocument,
  PartnerAsset,
  PartnerTrackingGateway,
  TrackingGatewayDocument,
} from './schemas/asset.schema';
import { normaliseTag, takesOver } from './asset-tracking';
import {
  AssetPingsDto,
  CreateTrackingGatewayDto,
  UpdateTrackingGatewayDto,
} from './dto/stores.dto';

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const newKey = () => `agk_${randomBytes(24).toString('base64url')}`;
const MAX_PINGS = 500;

/**
 * BLE / RFID proximity tracking for the equipment register. Gateways fixed in
 * rooms post the tags they hear; each tagged machine's location is the zone of
 * the gateway that heard it best most recently. Screens refresh live when a
 * machine changes room.
 */
@Injectable()
export class PartnerAssetTrackingService {
  constructor(
    @InjectModel(PartnerTrackingGateway.name)
    private readonly gatewayModel: Model<TrackingGatewayDocument>,
    @InjectModel(PartnerAsset.name)
    private readonly assetModel: Model<AssetDocument>,
    private readonly audit: AuditLogService,
    private readonly live: LiveBus,
  ) {}

  async listGateways(actor: PartnerActor) {
    const rows = await this.gatewayModel
      .find({ providerId: actor.provider._id })
      .sort({ zone: 1, name: 1 })
      .exec();
    return rows.map((g) => this.toGateway(g));
  }

  /** The key is returned once; only its hash is kept. */
  async createGateway(actor: PartnerActor, dto: CreateTrackingGatewayDto) {
    const key = newKey();
    const gw = await this.gatewayModel.create({
      providerId: actor.provider._id,
      name: dto.name,
      zone: dto.zone,
      keyHash: hashKey(key),
      createdByName: actor.member.fullName,
    });
    await this.record(actor, gw, 'gateway_added');
    return { gateway: this.toGateway(gw), key };
  }

  async rotateKey(actor: PartnerActor, id: string) {
    const gw = await this.load(actor, id);
    const key = newKey();
    gw.keyHash = hashKey(key);
    await gw.save();
    await this.record(actor, gw, 'gateway_key_rotated');
    return { gateway: this.toGateway(gw), key };
  }

  async updateGateway(
    actor: PartnerActor,
    id: string,
    dto: UpdateTrackingGatewayDto,
  ) {
    const gw = await this.load(actor, id);
    if (dto.name !== undefined) gw.name = dto.name;
    if (dto.zone !== undefined) gw.zone = dto.zone;
    if (dto.active !== undefined) gw.active = dto.active;
    await gw.save();
    await this.record(actor, gw, 'gateway_updated');
    return this.toGateway(gw);
  }

  /** Machine endpoint: one gateway's batch of readings. */
  async ingest(key: string | undefined, dto: AssetPingsDto) {
    if (!key) throw new UnauthorizedException('Missing x-gateway-key header');
    const gw = await this.gatewayModel
      .findOne({ keyHash: hashKey(key), active: true })
      .exec();
    if (!gw) throw new UnauthorizedException('Unknown or disabled gateway key');
    const now = new Date();
    // The newest reading per tag in this batch.
    const byTag = new Map<string, { at: Date; rssi?: number }>();
    for (const p of dto.pings.slice(0, MAX_PINGS)) {
      const tag = normaliseTag(p.tag);
      if (!tag) continue;
      let at = p.at ? new Date(p.at) : now;
      // A gateway clock running ahead must not pin a machine to a room.
      if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + 60_000)
        at = now;
      const prev = byTag.get(tag);
      if (!prev || at > prev.at) byTag.set(tag, { at, rssi: p.rssi });
    }
    const assets = byTag.size
      ? await this.assetModel
          .find({
            providerId: gw.providerId,
            trackerTag: { $in: [...byTag.keys()] },
          })
          .select('trackerTag lastSeen')
          .exec()
      : [];
    let updated = 0;
    let moved = 0;
    for (const a of assets) {
      const reading = byTag.get(a.trackerTag!)!;
      const next = {
        at: reading.at,
        zone: gw.zone,
        gatewayId: gw.id,
        rssi: reading.rssi,
      };
      const prev = a.lastSeen
        ? {
            at: a.lastSeen.at,
            zone: a.lastSeen.zone,
            gatewayId: a.lastSeen.gatewayId?.toString() ?? '',
            rssi: a.lastSeen.rssi,
          }
        : undefined;
      if (!takesOver(prev, next)) continue;
      if (prev?.zone !== next.zone) moved++;
      await this.assetModel.updateOne(
        { _id: a._id },
        {
          $set: {
            lastSeen: {
              at: reading.at,
              zone: gw.zone,
              gatewayId: gw._id,
              ...(reading.rssi !== undefined && { rssi: reading.rssi }),
            },
          },
        },
      );
      updated++;
    }
    gw.lastPingAt = now;
    await gw.save();
    // Only a change of room is announced: steady "still here" readings would flood the screens.
    if (moved) this.live.publish(gw.providerId, 'assets');
    return {
      received: dto.pings.length,
      matched: assets.length,
      updated,
      moved,
      unknownTags: byTag.size - assets.length,
    };
  }

  private async load(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Gateway not found');
    const gw = await this.gatewayModel
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!gw) throw new NotFoundException('Gateway not found');
    return gw;
  }

  private toGateway(g: TrackingGatewayDocument) {
    return {
      id: g.id,
      name: g.name,
      zone: g.zone,
      active: g.active,
      lastPingAt: g.lastPingAt?.toISOString() ?? null,
      createdAt: g.createdAt?.toISOString() ?? null,
    };
  }

  private record(
    actor: PartnerActor,
    g: TrackingGatewayDocument,
    change: string,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_ASSET_UPDATE,
      targetType: 'PartnerTrackingGateway',
      targetId: g.id,
      metadata: {
        providerId: actor.provider.id,
        label: `${g.name} (${g.zone})`,
        change,
      },
      ipAddress: actor.ip,
    });
  }
}
