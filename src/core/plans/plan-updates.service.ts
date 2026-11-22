import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type Redis from 'ioredis';
import { Model, Types } from 'mongoose';
import {
  Plan,
  PlanDocument,
  PlanTier,
  Subscription,
  SubscriptionDocument,
  SubscriptionStatus,
} from '../../admin/subscriptions/schemas/subscription.schema';
import { REDIS_CLIENT } from '../../database/redis.module';
import { upgradesFor } from '../../common/feature-flags';
import { UserPushService } from '../../notifications/user-push.service';

const CHANNEL = 'ayuva:plan-changes';
const CACHE_MS = 5 * 60_000;
/** A plan edit reaches at most this many subscribers by push; the rest refresh on next open. */
const MAX_PUSH = 2000;

export interface MyPlan {
  tier: PlanTier;
  name: string;
  features: string[];
  limits: Record<string, number | null>;
  status: 'active' | 'none';
  renewsAt: string | null;
  updatedAt: string;
  /** Features this tier switches off; screens show an upgrade prompt instead. */
  disabledFeatures: string[];
  /** For each switched-off feature, the cheapest plan that has it. */
  upgrades: Record<string, { tier: string; name: string }>;
}

export interface PlanChange {
  /** Users whose own subscription changed. */
  userIds?: string[];
  /** A plan whose features or limits changed: every cached plan is dropped. */
  planId?: string;
}

/**
 * The patient's current plan, and how a change made in the Admin Panel reaches
 * their phone: the change is published on Redis pub/sub so every API instance
 * drops its cached copy, and the instance that made it pushes the affected
 * people a "plan updated" message; the app re-reads GET /me/plan on it.
 * Without Redis the change still applies on this instance.
 */
@Injectable()
export class PlanUpdatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlanUpdatesService.name);
  private readonly cache = new Map<string, { at: number; plan: MyPlan }>();
  private sub?: Redis;

  constructor(
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
    @InjectModel(Subscription.name)
    private readonly subModel: Model<SubscriptionDocument>,
    private readonly push: UserPushService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  onModuleInit(): void {
    if (!this.redis) return;
    try {
      this.sub = this.redis.duplicate();
      this.sub.on('error', () => undefined);
      void this.sub.subscribe(CHANNEL).catch(() => undefined);
      this.sub.on('message', (channel: string, raw: string) => {
        if (channel !== CHANNEL) return;
        try {
          this.forget(JSON.parse(raw) as PlanChange);
        } catch {
          // Ignore a malformed message.
        }
      });
    } catch (err) {
      this.logger.warn(`plan-change channel unavailable: ${String(err)}`);
    }
  }

  onModuleDestroy(): void {
    this.sub?.disconnect();
  }

  async myPlan(userId: string): Promise<MyPlan> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.plan;
    const sub = await this.subModel
      .findOne({
        userId: new Types.ObjectId(userId),
        status: SubscriptionStatus.ACTIVE,
      })
      .sort({ startedAt: -1 })
      .lean()
      .exec();
    const plan = sub
      ? await this.planModel.findById(sub.planId).lean().exec()
      : await this.planModel.findOne({ tier: PlanTier.FREE }).lean().exec();
    const disabledFeatures = plan?.disabledFeatures ?? [];
    const all = disabledFeatures.length
      ? await this.planModel
          .find()
          .select('tier name priceMonthly active disabledFeatures')
          .lean()
          .exec()
      : [];
    const out: MyPlan = {
      tier: plan?.tier ?? PlanTier.FREE,
      name: plan?.name ?? 'Free',
      features: plan?.features ?? [],
      limits: plan?.limits ?? {},
      status: sub ? 'active' : 'none',
      renewsAt: sub?.renewsAt?.toISOString() ?? null,
      updatedAt: new Date().toISOString(),
      disabledFeatures,
      upgrades: upgradesFor(disabledFeatures, all),
    };
    this.cache.set(userId, { at: Date.now(), plan: out });
    return out;
  }

  /** Announces a change made in the Admin Panel. Never throws: the change itself is already saved. */
  async announce(change: PlanChange): Promise<void> {
    try {
      this.forget(change);
      if (this.redis?.status === 'ready')
        await this.redis
          .publish(CHANNEL, JSON.stringify(change))
          .catch(() => 0);
      const userIds =
        change.userIds ?? (await this.subscribersOf(change.planId));
      void this.notify(userIds);
    } catch (err) {
      this.logger.warn(`plan change announcement failed: ${String(err)}`);
    }
  }

  private forget(change: PlanChange): void {
    if (change.planId) this.cache.clear();
    for (const id of change.userIds ?? []) this.cache.delete(id);
  }

  private async subscribersOf(planId: string | undefined): Promise<string[]> {
    if (!planId || !Types.ObjectId.isValid(planId)) return [];
    const rows = await this.subModel
      .find({
        planId: new Types.ObjectId(planId),
        status: SubscriptionStatus.ACTIVE,
      })
      .select('userId')
      .limit(MAX_PUSH)
      .lean()
      .exec();
    return rows.map((r) => r.userId.toString());
  }

  /** No plan details in the push itself: the app fetches them signed in. */
  private async notify(userIds: string[]): Promise<void> {
    for (const userId of [...new Set(userIds)]) {
      try {
        await this.push.send(userId, {
          title: 'Your AYUVA plan was updated',
          body: 'Open the app to see what is included.',
          data: { type: 'plan_changed' },
        });
      } catch (err) {
        this.logger.debug(`plan push failed for ${userId}: ${String(err)}`);
      }
    }
  }
}
