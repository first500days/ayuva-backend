import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import {
  AuditAction,
  AuditLog,
  AuditLogDocument,
} from '../../audit-log/schemas/audit-log.schema';
import { TokenRevocationService } from '../../auth/services/token-revocation.service';
import { isUnrecognised, networkOf, type NetworkHistory } from './network-flags';

export interface AuditExplorerQuery {
  search?: string;
  action?: string;
  targetType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
  skip?: number;
}

const DAY = 86_400_000;
/** How far back an actor's networks are remembered. */
const NETWORK_MEMORY_DAYS = 180;

/** Overrides and account-level actions an auditor looks at first. */
const CRITICAL_ACTIONS: AuditAction[] = [
  AuditAction.SESSIONS_TERMINATED,
  AuditAction.ADMIN_MFA_RESET,
  AuditAction.ADMIN_USER_STATUS_CHANGE,
  AuditAction.ADMIN_PROVIDER_SUSPEND,
  AuditAction.ADMIN_HOSPITAL_SUSPEND,
  AuditAction.ADMIN_LAB_SUSPEND,
  AuditAction.ADMIN_ROLE_UPDATE,
  AuditAction.ACCOUNT_DELETED,
  AuditAction.RECORD_DELETE,
];

@Injectable()
export class AdminAuditExplorerService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    private readonly revocation: TokenRevocationService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(query: AuditExplorerQuery) {
    const filter: Record<string, unknown> = {};

    if (query.action) filter.action = query.action;
    if (query.targetType) filter.targetType = query.targetType;
    if (query.actorId) filter.actorId = query.actorId;

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) (filter.createdAt as any).$gte = new Date(query.from);
      if (query.to) (filter.createdAt as any).$lte = new Date(query.to);
    }

    if (query.search) {
      filter.$or = [
        { targetType: { $regex: query.search, $options: 'i' } },
        { action: { $regex: query.search, $options: 'i' } },
        { ipAddress: { $regex: query.search, $options: 'i' } },
      ];
    }

    const limit = query.limit || 50;
    const skip = query.skip || 0;

    const [logs, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .populate('actorId', 'fullName email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditModel.countDocuments(filter).exec(),
    ]);

    const networks = await this.networkHistory(
      logs.map((l) => String((l.actorId as any)?._id ?? l.actorId ?? '')),
    );

    return {
      items: logs.map((l) => {
        const actorId = String((l.actorId as any)?._id ?? l.actorId ?? '');
        const network = networkOf(l.ipAddress);
        const at: Date = (l as any).createdAt ?? new Date();
        return {
          id: l._id.toString(),
          eventId: `AUD-${l._id.toString().slice(-6).toUpperCase()}`,
          actor: {
            id: (l.actorId as any)?._id?.toString() || 'system',
            name: (l.actorId as any)?.fullName || 'System Administrator',
            email: (l.actorId as any)?.email || 'admin@ayuva.health',
            role: (l.actorId as any)?.role || 'super_admin',
          },
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId?.toString() || '',
          timestamp: at.toISOString(),
          metadata: l.metadata || {},
          ipAddress: l.ipAddress || 'Not recorded',
          network,
          unrecognisedNetwork: isUnrecognised(
            at,
            network,
            networks.get(actorId) ?? new Map(),
          ),
          reason:
            (l.metadata as any)?.reason || 'Standard administrative operation',
          outcome: (l.metadata as any)?.outcome || 'succeeded',
          beforeState: (l.metadata as any)?.beforeState || null,
          afterState: (l.metadata as any)?.afterState || null,
          correlationId:
            (l.metadata as any)?.correlationId ||
            `COR-${l._id.toString().slice(-4).toUpperCase()}`,
        };
      }),
      total,
      limit,
      skip,
    };
  }

  /** Per actor: each network they used and when they were first seen on it. */
  private async networkHistory(
    actorIds: string[],
  ): Promise<Map<string, Map<string, NetworkHistory>>> {
    const out = new Map<string, Map<string, NetworkHistory>>();
    const ids = [...new Set(actorIds)].filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (!ids.length) return out;
    const rows = await this.auditModel
      .aggregate<{ _id: { actor: Types.ObjectId; ip: string }; first: Date }>([
        {
          $match: {
            actorId: { $in: ids.map((id) => new Types.ObjectId(id)) },
            ipAddress: { $nin: [null, ''] },
            createdAt: {
              $gte: new Date(Date.now() - NETWORK_MEMORY_DAYS * DAY),
            },
          },
        },
        {
          $group: {
            _id: { actor: '$actorId', ip: '$ipAddress' },
            first: { $min: '$createdAt' },
          },
        },
      ])
      .exec();
    for (const r of rows) {
      const net = networkOf(r._id.ip);
      if (!net) continue;
      const actor = String(r._id.actor);
      const mine = out.get(actor) ?? new Map<string, NetworkHistory>();
      const seen = mine.get(net);
      if (!seen || r.first < seen.firstSeen)
        mine.set(net, { firstSeen: r.first });
      out.set(actor, mine);
    }
    return out;
  }

  async getSummary() {
    const since = new Date(Date.now() - DAY);
    const [
      totalEvents,
      events24h,
      highImpactEvents24h,
      criticalActionsCount,
      top,
      recent,
    ] = await Promise.all([
      this.auditModel.countDocuments().exec(),
      this.auditModel.countDocuments({ createdAt: { $gte: since } }).exec(),
      this.auditModel
        .countDocuments({
          createdAt: { $gte: since },
          action: { $regex: /^admin_/ },
        })
        .exec(),
      this.auditModel
        .countDocuments({
          createdAt: { $gte: since },
          action: { $in: CRITICAL_ACTIONS },
        })
        .exec(),
      this.auditModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
          user?: { fullName?: string; role?: string };
        }>([
          { $match: { createdAt: { $gte: since } } },
          { $group: { _id: '$actorId', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 3 },
          {
            $lookup: {
              from: 'users',
              localField: '_id',
              foreignField: '_id',
              as: 'user',
            },
          },
          { $set: { user: { $first: '$user' } } },
        ])
        .exec(),
      this.auditModel
        .find({ createdAt: { $gte: since }, ipAddress: { $nin: [null, ''] } })
        .select('actorId ipAddress createdAt')
        .sort({ createdAt: -1 })
        .limit(2000)
        .lean()
        .exec(),
    ]);
    const networks = await this.networkHistory(
      recent.map((r) => String(r.actorId)),
    );
    const unrecognisedNetworks24h = recent.filter((r) =>
      isUnrecognised(
        r.createdAt ?? new Date(),
        networkOf(r.ipAddress),
        networks.get(String(r.actorId)) ?? new Map(),
      ),
    ).length;
    return {
      totalEvents,
      events24h,
      highImpactEvents24h,
      criticalActionsCount,
      unrecognisedNetworks24h,
      topActors: top.map((t) => ({
        name: t.user?.fullName ?? 'Unknown',
        role: t.user?.role ?? '—',
        count: t.count,
      })),
    };
  }

  async exportLogs(query: AuditExplorerQuery) {
    const data = await this.findAll({ ...query, limit: 1000, skip: 0 });
    return data.items;
  }

  /**
   * "Terminate web tokens": every token this login holds stops working now
   * (web and app), its live sockets close, and the action is sealed into the
   * audit trail with the reason given.
   */
  async terminateSessions(adminId: string, userId: string, reason: string) {
    if (!Types.ObjectId.isValid(userId))
      throw new BadRequestException('Unknown user');
    if (adminId === userId)
      throw new BadRequestException('Use Sign out to end your own session');
    const ended = await this.revocation.revoke([userId]);
    await this.audit.record({
      actorId: adminId,
      action: AuditAction.SESSIONS_TERMINATED,
      targetType: 'User',
      targetId: userId,
      metadata: { reason, outcome: ended ? 'succeeded' : 'no such login' },
    });
    return { ended: ended > 0, at: new Date().toISOString() };
  }
}
