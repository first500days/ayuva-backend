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
import { LiveBus, type ShareEnded } from '../../common/live/live-bus.service';
import { REDIS_CLIENT } from '../../database/redis.module';
import { ShareGrant, ShareGrantDocument } from './schemas/share-grant.schema';
import {
  ShareOrganisation,
  ShareOrganisationDocument,
} from './schemas/share-organisation.schema';

const CHANNEL = 'ayuva:share-ended';
const SWEEP_MS = 15_000;

/**
 * Closes partner screens the moment a share ends. Reads were already refused
 * after expiry or revocation; this tells open Partner Portal screens so the
 * patient's shared data blurs and is re-checked instead of staying on screen.
 *
 * Revocations announce at once; a sweep every 15 s announces expiries (a
 * 2-hour share closes within seconds of its end). Announcements go over Redis
 * pub/sub so every API instance reaches its own partner sockets; without
 * Redis this instance still tells its own.
 */
@Injectable()
export class ShareLiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShareLiveService.name);
  private sub?: Redis;
  private sweeper?: NodeJS.Timeout;

  constructor(
    @InjectModel(ShareGrant.name)
    private readonly grantModel: Model<ShareGrantDocument>,
    @InjectModel(ShareOrganisation.name)
    private readonly orgModel: Model<ShareOrganisationDocument>,
    private readonly live: LiveBus,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  onModuleInit(): void {
    if (this.redis) {
      try {
        this.sub = this.redis.duplicate();
        this.sub.on('error', () => undefined);
        void this.sub.subscribe(CHANNEL).catch(() => undefined);
        this.sub.on('message', (channel: string, raw: string) => {
          if (channel !== CHANNEL) return;
          try {
            this.live.shareEnded(JSON.parse(raw) as ShareEnded);
          } catch {
            // Ignore a malformed message.
          }
        });
      } catch (err) {
        this.logger.warn(`share channel unavailable: ${String(err)}`);
      }
    }
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_MS);
    this.sweeper.unref();
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sub?.disconnect();
  }

  /** Announces that this grant no longer gives access. Never throws. */
  async ended(
    grant: ShareGrantDocument,
    reason: ShareEnded['reason'],
  ): Promise<void> {
    try {
      const org = Types.ObjectId.isValid(grant.organisationId)
        ? await this.orgModel
            .findById(grant.organisationId)
            .select('providerId')
            .lean()
            .exec()
        : null;
      if (!org?.providerId) return;
      const msg: ShareEnded = {
        providerId: org.providerId.toString(),
        patientId: grant.userId.toString(),
        grantId: grant.id,
        reason,
      };
      if (this.redis?.status === 'ready' && this.sub)
        await this.redis.publish(CHANNEL, JSON.stringify(msg));
      else this.live.shareEnded(msg);
    } catch (err) {
      this.logger.warn(`share end announcement failed: ${String(err)}`);
    }
  }

  /** Claims each newly expired grant once (safe with several instances) and announces it. */
  async sweep(now = new Date()): Promise<number> {
    let announced = 0;
    try {
      const due = await this.grantModel
        .find({
          status: 'active',
          expiresAt: { $lte: now },
          endAnnouncedAt: { $exists: false },
        })
        .limit(200)
        .exec();
      for (const g of due) {
        const claim = await this.grantModel
          .updateOne(
            { _id: g._id, endAnnouncedAt: { $exists: false } },
            { $set: { endAnnouncedAt: now } },
          )
          .exec();
        if (claim.modifiedCount !== 1) continue;
        await this.ended(g, 'expired');
        announced++;
      }
    } catch (err) {
      this.logger.debug(`share sweep failed: ${String(err)}`);
    }
    return announced;
  }
}
