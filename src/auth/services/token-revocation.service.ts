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
import { LiveBus } from '../../common/live/live-bus.service';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { REDIS_CLIENT } from '../../database/redis.module';

/** Starts the 401 message when an administrator ended this login's sessions. */
export const SESSION_REVOKED = 'SESSION_REVOKED';

const CHANNEL = 'ayuva:token-revocations';
const CACHE_MS = 60_000;

interface Revoked {
  userIds: string[];
  at: number;
}

/**
 * "Terminate web tokens": every access and refresh token a login holds that
 * was issued before the cut-off stops working at once, and its live sockets
 * close. The cut-off is kept on the user (source of truth), cached here, and
 * announced over Redis pub/sub so every API instance drops the tokens without
 * waiting for its cache to expire.
 */
@Injectable()
export class TokenRevocationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenRevocationService.name);
  private readonly cache = new Map<string, { after: number; at: number }>();
  private sub?: Redis;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
    @Optional() private readonly live?: LiveBus,
  ) {}

  onModuleInit(): void {
    if (!this.redis) return;
    try {
      this.sub = this.redis.duplicate();
      // Without Redis this instance still revokes for itself; don't flood the log.
      this.sub.on('error', () => undefined);
      void this.sub.subscribe(CHANNEL).catch(() => undefined);
      this.sub.on('message', (channel: string, raw: string) => {
        if (channel !== CHANNEL) return;
        try {
          this.apply(JSON.parse(raw) as Revoked);
        } catch {
          // Ignore a malformed message.
        }
      });
    } catch (err) {
      this.logger.warn(`revocation channel unavailable: ${String(err)}`);
    }
  }

  onModuleDestroy(): void {
    this.sub?.disconnect();
  }

  /** Epoch ms before which this login's tokens are refused (0 = none). */
  async validAfter(userId: string): Promise<number> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.after;
    if (!Types.ObjectId.isValid(userId)) return 0;
    const user = await this.userModel
      .findById(userId)
      .select('tokensValidAfter')
      .lean()
      .exec();
    const after = user?.tokensValidAfter?.getTime() ?? 0;
    this.cache.set(userId, { after, at: Date.now() });
    return after;
  }

  /** Whether a token issued at `iat` (seconds) was cut off. */
  async isRevoked(userId: string, iat: number | undefined): Promise<boolean> {
    if (!iat) return false;
    const after = await this.validAfter(userId);
    return after > 0 && iat * 1000 < after;
  }

  /** Ends every current token and live socket of these logins. Returns how many were cut off. */
  async revoke(userIds: string[]): Promise<number> {
    const ids = [...new Set(userIds)].filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (!ids.length) return 0;
    const at = Date.now();
    const res = await this.userModel
      .updateMany(
        { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } },
        { $set: { tokensValidAfter: new Date(at) } },
      )
      .exec();
    const msg: Revoked = { userIds: ids, at };
    this.apply(msg);
    if (this.redis?.status === 'ready')
      await this.redis.publish(CHANNEL, JSON.stringify(msg)).catch(() => 0);
    return res.modifiedCount ?? ids.length;
  }

  private apply({ userIds, at }: Revoked): void {
    for (const id of userIds) {
      this.cache.set(id, { after: at, at: Date.now() });
      this.live?.endSessions(id, 'tokens_revoked');
    }
  }
}
