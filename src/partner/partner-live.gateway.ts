import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import type WebSocket from 'ws';
import { User, UserDocument, UserStatus } from '../core/users/schemas/user.schema';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { REDIS_CLIENT } from '../database/redis.module';

/** Areas of the portal the server announces changes for (must match ayuva-frontend's `LiveTopic`). */
export type LiveTopic =
  | 'appointments'
  | 'census'
  | 'wards'
  | 'referrals'
  | 'notes'
  | 'billing'
  | 'telemetry';

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FROZEN = 4403;
const CLOSE_REPLACED = 4409;
const AUTH_TIMEOUT_MS = 5000;
const PUBSUB_CHANNEL = 'partner-live:notify';

interface NotifyMessage {
  userId: string;
  topics?: LiveTopic[];
  vitals?: Record<string, unknown>;
  kick?: 'frozen';
}

/**
 * Raw-WebSocket gateway backing `ayuva-frontend/src/lib/live-client.ts`. That
 * client already assumes this contract (auth handshake, {t:"inv"} topic
 * invalidation, {t:"vitals"} frames, and the 4401/4403/4409 close codes) —
 * this gateway exists to actually implement it.
 *
 * Pub/sub over the existing Redis client so `notify`/`kick` work correctly
 * even when the API runs as more than one instance.
 */
@WebSocketGateway({ path: '/api/v1/partner/live' })
export class PartnerLiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(PartnerLiveGateway.name);
  private readonly sockets = new Map<string, Set<WebSocket>>();
  private readonly sub: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.sub = this.redis.duplicate();
    this.sub.on('error', (err) => this.logger.warn(`Redis pubsub error: ${err.message}`));
    this.sub
      .subscribe(PUBSUB_CHANNEL)
      .catch((err: Error) => this.logger.warn(`Failed to subscribe to ${PUBSUB_CHANNEL}: ${err.message}`));
    this.sub.on('message', (_channel: string, raw: string) => {
      try {
        this.deliver(JSON.parse(raw) as NotifyMessage);
      } catch {
        this.logger.warn('Dropped malformed partner-live pubsub payload');
      }
    });
  }

  handleConnection(client: WebSocket) {
    let authenticated = false;
    const timer = setTimeout(() => {
      if (!authenticated) client.close(CLOSE_UNAUTHORIZED);
    }, AUTH_TIMEOUT_MS);

    client.once('message', (raw: Buffer) => {
      void this.authenticate(client, raw, timer).then((ok) => {
        authenticated = ok;
      });
    });

    client.on('error', () => client.close(CLOSE_UNAUTHORIZED));
  }

  handleDisconnect(client: WebSocket) {
    for (const [userId, set] of this.sockets) {
      if (set.delete(client) && set.size === 0) this.sockets.delete(userId);
    }
  }

  /** Call after a mutation so the frontend's `TOPIC_QUERIES` invalidation fires for real. */
  notify(userId: string, topics: LiveTopic[]) {
    this.publish({ userId, topics });
  }

  /** Streams one bedside vitals frame (shape consumed by `useVitalsFeed`). */
  notifyVitals(userId: string, vitals: Record<string, unknown>) {
    this.publish({ userId, vitals });
  }

  /** Force-closes every open socket for a user — admin suspend / facility kill-switch (Phase 5). */
  kick(userId: string) {
    this.publish({ userId, kick: 'frozen' });
  }

  private publish(msg: NotifyMessage) {
    this.redis
      .publish(PUBSUB_CHANNEL, JSON.stringify(msg))
      .catch((err: Error) => this.logger.warn(`Failed to publish partner-live event: ${err.message}`));
  }

  private async authenticate(client: WebSocket, raw: Buffer, timer: NodeJS.Timeout): Promise<boolean> {
    try {
      const msg = JSON.parse(raw.toString()) as { t?: string; token?: string };
      if (msg.t !== 'auth' || !msg.token) {
        client.close(CLOSE_UNAUTHORIZED);
        return false;
      }

      const payload = this.jwtService.verify<JwtPayload>(msg.token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });

      const user = await this.userModel.findById(payload.sub).select('status').lean();
      if (!user || user.status === UserStatus.SUSPENDED || user.status === UserStatus.INACTIVE) {
        client.close(CLOSE_FROZEN);
        return false;
      }

      clearTimeout(timer);
      this.register(payload.sub, client);
      client.send(JSON.stringify({ t: 'ready' }));
      return true;
    } catch {
      client.close(CLOSE_UNAUTHORIZED);
      return false;
    }
  }

  private register(userId: string, client: WebSocket) {
    const existing = this.sockets.get(userId);
    if (existing) {
      for (const old of existing) old.close(CLOSE_REPLACED);
      existing.clear();
      existing.add(client);
    } else {
      this.sockets.set(userId, new Set([client]));
    }
  }

  private deliver(msg: NotifyMessage) {
    const set = this.sockets.get(msg.userId);
    if (!set) return;
    for (const client of [...set]) {
      if (client.readyState !== client.OPEN) continue;
      if (msg.kick === 'frozen') client.close(CLOSE_FROZEN);
      else if (msg.vitals) client.send(JSON.stringify({ t: 'vitals', ...msg.vitals }));
      else if (msg.topics) client.send(JSON.stringify({ t: 'inv', topics: msg.topics }));
    }
  }
}
