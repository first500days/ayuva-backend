import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type Redis from 'ioredis';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { REDIS_CLIENT } from '../../database/redis.module';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordType,
} from './schemas/medical-record.schema';
import { RecordsService } from './records.service';

/** A scan link opens one file, once, within this long. */
export const SCAN_KEY_TTL_S = 60;
const USED_PREFIX = 'ayuva:sv-used:';

interface ScanKeyClaims {
  typ: 'scan_view';
  sub: string;
  rid: string;
  jti: string;
}

/** Formats the in-app viewer can draw. DICOM stays with the hospital's viewer. */
const VIEWABLE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;

/**
 * Single-use, time-limited links for the app's in-app scan viewer: the app
 * asks for a link to one of the patient's own imaging studies and loads it in
 * a WebView overlay. A link works once (its id is spent in Redis, or in memory
 * without Redis) and expires after 60 seconds, so a copied URL is useless.
 */
@Injectable()
export class ScanViewKeysService {
  private readonly spent = new Map<string, number>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly records: RecordsService,
    private readonly audit: AuditLogService,
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  private secret(): string {
    return `scan-view:${this.config.get<string>('jwt.accessSecret') ?? 'dev-access-secret'}`;
  }

  async issue(userId: string, recordId: string) {
    if (!Types.ObjectId.isValid(recordId))
      throw new NotFoundException('Record not found');
    const record = await this.recordModel
      .findOne({ _id: recordId, patientId: new Types.ObjectId(userId) })
      .select('type mimeType originalFileName')
      .lean()
      .exec();
    if (!record) throw new NotFoundException('Record not found');
    if (record.type !== MedicalRecordType.SCAN)
      throw new BadRequestException('The scan viewer is for imaging studies');
    const mimeType = record.mimeType ?? '';
    const viewable = VIEWABLE.test(mimeType);
    const claims: ScanKeyClaims = {
      typ: 'scan_view',
      sub: userId,
      rid: recordId,
      jti: randomBytes(16).toString('hex'),
    };
    const key = await this.jwt.signAsync(claims, {
      secret: this.secret(),
      expiresIn: SCAN_KEY_TTL_S,
    });
    return {
      path: `/scan-view?key=${encodeURIComponent(key)}`,
      mimeType,
      viewable,
      expiresAt: new Date(Date.now() + SCAN_KEY_TTL_S * 1000).toISOString(),
    };
  }

  /** The file a link was issued for: once, before it expires. */
  async redeem(key: string) {
    let c: ScanKeyClaims;
    try {
      c = await this.jwt.verifyAsync<ScanKeyClaims>(key, {
        secret: this.secret(),
      });
    } catch {
      throw new UnauthorizedException(
        'This link has expired. Open the scan again in the app.',
      );
    }
    if (c.typ !== 'scan_view')
      throw new UnauthorizedException('Not a scan link');
    if (!(await this.spend(c.jti)))
      throw new UnauthorizedException(
        'This link was already used. Open the scan again in the app.',
      );
    const file = await this.records.download(c.sub, c.rid);
    await this.audit.record({
      actorId: c.sub,
      action: AuditAction.RECORD_VIEW,
      targetType: 'MedicalRecord',
      targetId: c.rid,
      metadata: { via: 'scan_viewer' },
    });
    return file;
  }

  /** True the first time a key id is spent; false after. */
  private async spend(jti: string): Promise<boolean> {
    if (this.redis?.status === 'ready') {
      const ok = await this.redis
        .set(`${USED_PREFIX}${jti}`, '1', 'EX', SCAN_KEY_TTL_S * 2, 'NX')
        .catch(() => null);
      if (ok !== null) return ok === 'OK';
    }
    const now = Date.now();
    for (const [k, at] of this.spent)
      if (now - at > SCAN_KEY_TTL_S * 2000) this.spent.delete(k);
    if (this.spent.has(jti)) return false;
    this.spent.set(jti, now);
    return true;
  }
}
