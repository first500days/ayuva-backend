import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type Redis from 'ioredis';
import { Connection, Model } from 'mongoose';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import {
  AIInteractionLog,
  AIInteractionLogDocument,
} from '../../ai/ai-interaction-log/schemas/ai-interaction-log.schema';
import { LiveBus } from '../../common/live/live-bus.service';
import { requestMetrics } from '../../common/observability/request-metrics';
import { REDIS_CLIENT } from '../../database/redis.module';
import { buildPulse, type Measurements } from './system-pulse';

const PING_TIMEOUT_MS = 1_000;
const AI_REFRESH_MS = 15_000;

/** Resolves to the elapsed ms, or null when the call fails or takes too long. */
async function timed(call: () => Promise<unknown>): Promise<number | null> {
  const start = process.hrtime.bigint();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      call(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), PING_TIMEOUT_MS);
      }),
    ]);
    return Math.max(
      1,
      Math.round(Number(process.hrtime.bigint() - start) / 1e6),
    );
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Real measurements behind the Admin Panel's live system graph: API traffic,
 * event-loop lag, database and Redis round trips, live sockets and AI calls.
 * Pings only run while someone is watching (see AdminLiveGateway).
 */
@Injectable()
export class SystemPulseService implements OnModuleDestroy {
  private readonly logger = new Logger(SystemPulseService.name);
  private readonly loop: IntervalHistogram = monitorEventLoopDelay({
    resolution: 20,
  });
  private mongo: Measurements['mongo'] = { up: null, pingMs: null };
  private redisState: Measurements['redis'] = { up: null, pingMs: null };
  private ai: Measurements['ai'] = { last5m: 0, avgMs: null, flagged: 0 };
  private aiAt = 0;
  private pinging = false;
  private adminSockets = 0;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @InjectModel(AIInteractionLog.name)
    private readonly aiLogModel: Model<AIInteractionLogDocument>,
    private readonly bus: LiveBus,
    private readonly config: ConfigService,
  ) {
    this.loop.enable();
  }

  onModuleDestroy(): void {
    this.loop.disable();
  }

  setAdminSockets(n: number): void {
    this.adminSockets = n;
  }

  /** One frame of the graph. Kicks off fresh pings without waiting for them. */
  sample() {
    void this.refresh();
    const traffic = requestMetrics.snapshot();
    const lag = Math.round(this.loop.mean / 1e6);
    this.loop.reset();
    return {
      at: new Date().toISOString(),
      ...buildPulse({
        api: {
          ...traffic,
          loopLagMs: Number.isFinite(lag) ? lag : 0,
          heapMb: Math.round(process.memoryUsage().heapUsed / 1_048_576),
          uptimeS: Math.round(process.uptime()),
        },
        mongo: this.mongo,
        redis: this.redisState,
        sockets: {
          partner: this.bus.socketCount('partner'),
          admin: this.adminSockets,
        },
        ai: this.ai,
        channels: this.channels(),
      }),
    };
  }

  private async refresh(): Promise<void> {
    if (this.pinging) return;
    this.pinging = true;
    try {
      const [mongoMs, redisMs] = await Promise.all([
        this.connection.readyState === 1 && this.connection.db
          ? timed(() => this.connection.db!.admin().ping())
          : Promise.resolve(null),
        // An offline client would queue the ping forever; report it down instead.
        this.redis.status === 'ready'
          ? timed(() => this.redis.ping())
          : Promise.resolve(null),
      ]);
      this.mongo = { up: mongoMs !== null, pingMs: mongoMs };
      this.redisState = { up: redisMs !== null, pingMs: redisMs };
      if (Date.now() - this.aiAt > AI_REFRESH_MS) await this.refreshAi();
    } catch (err) {
      this.logger.debug(`pulse refresh failed: ${String(err)}`);
    } finally {
      this.pinging = false;
    }
  }

  private async refreshAi(): Promise<void> {
    this.aiAt = Date.now();
    const [row] = await this.aiLogModel
      .aggregate<{ n: number; avg: number | null; flagged: number }>([
        { $match: { createdAt: { $gte: new Date(Date.now() - 5 * 60_000) } } },
        {
          $group: {
            _id: null,
            n: { $sum: 1 },
            avg: { $avg: '$latencyMs' },
            flagged: { $sum: { $cond: ['$flagged', 1, 0] } },
          },
        },
      ])
      .exec();
    this.ai = {
      last5m: row?.n ?? 0,
      avgMs: row?.avg != null ? Math.round(row.avg) : null,
      flagged: row?.flagged ?? 0,
    };
  }

  private channels(): Measurements['channels'] {
    const has = (k: string) => !!this.config.get<string>(k);
    return {
      push:
        has('firebase.projectId') &&
        has('firebase.clientEmail') &&
        has('firebase.privateKey'),
      whatsapp: has('whatsappCloud.accessToken') || has('sms.whatsappFrom'),
      sms: has('sms.twilioAccountSid') && has('sms.from'),
    };
  }
}
