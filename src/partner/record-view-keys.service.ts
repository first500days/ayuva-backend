import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { LiveBus } from '../common/live/live-bus.service';
import { REDIS_CLIENT } from '../database/redis.module';
import { PartnerRecordsService } from './partner-records.service';

/** A key opens one file, once, within this long. */
export const VIEW_KEY_TTL_S = 60;
const USED_PREFIX = 'ayuva:rv-used:';
const REVOKED_TTL_MS = 24 * 60 * 60_000;

interface ViewKeyClaims {
  typ: 'record_view';
  sub: string;
  gid: string;
  rid: string;
  jti: string;
}

/**
 * Single-use, time-limited signed keys for opening a patient's shared record:
 * the portal asks for a key for one file, then opens the file with it. A key
 * works once (its id is spent in Redis, or in memory without Redis), expires
 * in 60 seconds, and dies at once if the patient revokes the share or it
 * expires (announced to every instance over the share-ended channel). The
 * share is checked again in the database when the file is opened.
 */
@Injectable()
export class RecordViewKeysService implements OnModuleInit, OnModuleDestroy {
  private readonly spent = new Map<string, number>();
  private readonly endedGrants = new Map<string, number>();
  private off?: () => void;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly records: PartnerRecordsService,
    private readonly live: LiveBus,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  onModuleInit(): void {
    this.off = this.live.onShareEnded((e) =>
      this.endedGrants.set(e.grantId, Date.now()),
    );
  }

  onModuleDestroy(): void {
    this.off?.();
  }

  private secret(): string {
    return `record-view:${this.config.get<string>('jwt.accessSecret') ?? 'dev-access-secret'}`;
  }

  /** Issues a key after checking this login may open the record under the share now. */
  async issue(userId: string, grantId: string, recordId: string) {
    await this.records.assertRecordInShare(userId, grantId, recordId);
    const claims: ViewKeyClaims = {
      typ: 'record_view',
      sub: userId,
      gid: grantId,
      rid: recordId,
      jti: randomBytes(16).toString('hex'),
    };
    const key = await this.jwt.signAsync(claims, {
      secret: this.secret(),
      expiresIn: VIEW_KEY_TTL_S,
    });
    return {
      key,
      expiresAt: new Date(Date.now() + VIEW_KEY_TTL_S * 1000).toISOString(),
    };
  }

  /** Opens the file a key was issued for: once, before it expires, while the share stands. */
  async redeem(key: string) {
    let c: ViewKeyClaims;
    try {
      c = await this.jwt.verifyAsync<ViewKeyClaims>(key, {
        secret: this.secret(),
      });
    } catch {
      throw new UnauthorizedException(
        'This link has expired. Open the document again from the portal.',
      );
    }
    if (c.typ !== 'record_view')
      throw new UnauthorizedException('Not a document key');
    const ended = this.endedGrants.get(c.gid);
    if (ended && Date.now() - ended < REVOKED_TTL_MS)
      throw new UnauthorizedException('The patient’s share has ended.');
    if (!(await this.spend(c.jti)))
      throw new UnauthorizedException(
        'This link was already used. Open the document again from the portal.',
      );
    return this.records.downloadRecord(c.sub, c.gid, c.rid);
  }

  /** True the first time a key id is spent; false after. */
  private async spend(jti: string): Promise<boolean> {
    if (this.redis?.status === 'ready') {
      const ok = await this.redis
        .set(`${USED_PREFIX}${jti}`, '1', 'EX', VIEW_KEY_TTL_S * 2, 'NX')
        .catch(() => null);
      if (ok !== null) return ok === 'OK';
    }
    const now = Date.now();
    for (const [k, at] of this.spent)
      if (now - at > VIEW_KEY_TTL_S * 2000) this.spent.delete(k);
    if (this.spent.has(jti)) return false;
    this.spent.set(jti, now);
    return true;
  }
}
