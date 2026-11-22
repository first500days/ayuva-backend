import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import {
  MedicalRecord,
  MedicalRecordDocument,
} from '../../core/records/schemas/medical-record.schema';
import {
  User,
  UserDocument,
  UserStatus,
} from '../../core/users/schemas/user.schema';
import { MailService, maskEmail } from '../../mail/mail.service';
import { StorageService } from '../../storage/storage.service';
import { withDefaults } from '../app-notifications.service';
import type { NotificationPreferencesDto } from '../dto/notification-response.dto';
import { SMS_SENDER, maskPhone } from '../sms/sms-sender';
import type { SmsSender } from '../sms/sms-sender';
import {
  ReportLink,
  ReportLinkChannel,
  ReportLinkDocument,
} from './schemas/report-link.schema';

const LINK_PURPOSE = 'report_link';
const VIEW_PURPOSE = 'report_view';
const ALGORITHMS = ['HS256'] as const;

// The security rule for links sent by WhatsApp or email: 15 to 30 minutes.
const MIN_TTL_MINUTES = 15;
const MAX_TTL_MINUTES = 30;
const VIEW_MINUTES = 10;

const CODE_MINUTES = 5;
const CODE_RESEND_SECONDS = 60;
const MAX_CODE_SENDS = 5;
const MAX_CODE_FAILURES = 5;
const LOCK_MINUTES = 15;

const RENEW_DAYS = 14;
const MAX_RENEWALS = 5;
const RENEW_WAIT_SECONDS = 120;

const INVALID = 'This link isn’t valid';
const EXPIRED = 'This link has expired — ask for a new one below';
const USED = 'This link has already been used — ask for a new one below';

interface LinkClaims {
  purpose: typeof LINK_PURPOSE;
  jti: string;
}
interface ViewClaims {
  purpose: typeof VIEW_PURPOSE;
  jti: string;
}

export type LinkState = 'ready' | 'expired' | 'used';

export interface PatientContact {
  /** Whose phone and devices these are: the patient, or a guardian for a managed family member. */
  accountId: string;
  /** Set when a guardian receives this for a family member they manage. */
  profileId?: string;
  phone?: string;
  email?: string;
  prefs: NotificationPreferencesDto;
}

export interface IssuedLink {
  token: string;
  url: string;
  expiresAt: Date;
}

const usableEmail = (email?: string | null) =>
  email && !/(\.invalid|@ayuva\.internal)$/i.test(email) ? email : undefined;

/**
 * Secure report links: a signed JWT that expires in 15 to 30 minutes, opened
 * once after a one-time code. Showing the link's page changes nothing, so link
 * previews and mail scanners can't use up a link.
 */
@Injectable()
export class ReportLinksService {
  constructor(
    @InjectModel(ReportLink.name)
    private readonly links: Model<ReportLinkDocument>,
    @InjectModel(User.name)
    private readonly users: Model<UserDocument>,
    @InjectModel(MedicalRecord.name)
    private readonly records: Model<MedicalRecordDocument>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
    private readonly audit: AuditLogService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  private get secret(): string {
    return (
      this.config.get<string>('reportLinks.secret') ||
      `${this.config.get<string>('jwt.accessSecret')}:report-link`
    );
  }

  private get ttlMinutes(): number {
    const set = this.config.get<number>('reportLinks.ttlMinutes');
    const minutes = Number.isFinite(set) ? (set as number) : MAX_TTL_MINUTES;
    return Math.min(MAX_TTL_MINUTES, Math.max(MIN_TTL_MINUTES, minutes));
  }

  private get isProduction(): boolean {
    return this.config.get<string>('nodeEnv') === 'production';
  }

  /** Where someone's report notices go. A family member's reach their guardian. */
  async contact(
    patientId: Types.ObjectId | string,
  ): Promise<PatientContact | null> {
    const select = 'phone email managedBy notificationPrefs status';
    const patient = await this.users
      .findById(patientId)
      .select(select)
      .lean()
      .exec();
    if (!patient) return null;
    const guardian = patient.managedBy
      ? await this.users.findById(patient.managedBy).select(select).lean().exec()
      : null;
    const holder = guardian ?? patient;
    if (holder.status !== UserStatus.ACTIVE) return null;
    return {
      accountId: holder._id.toString(),
      ...(guardian && { profileId: patient._id.toString() }),
      phone: holder.phone || undefined,
      email: usableEmail(holder.email),
      prefs: withDefaults(holder.notificationPrefs),
    };
  }

  async issue(input: {
    recordId: Types.ObjectId | string;
    patientId: Types.ObjectId | string;
    providerId?: Types.ObjectId | string;
    channel: ReportLinkChannel;
    firstIssuedAt?: Date;
    renewals?: number;
  }): Promise<IssuedLink> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);
    await this.links.create({
      jti,
      recordId: new Types.ObjectId(input.recordId),
      patientId: new Types.ObjectId(input.patientId),
      ...(input.providerId && {
        providerId: new Types.ObjectId(input.providerId),
      }),
      channel: input.channel,
      expiresAt,
      firstIssuedAt: input.firstIssuedAt ?? new Date(),
      renewals: input.renewals ?? 0,
    });
    // Only the row's id goes in the token: anyone can read a JWT's contents.
    const claims: LinkClaims = { purpose: LINK_PURPOSE, jti };
    const token = await this.sign(claims, this.ttlMinutes * 60);
    const base = this.config.get<string>('frontend.url') ?? '';
    return { token, url: `${base}/v/${token}`, expiresAt };
  }

  /** What the page should show. Changes nothing, so a link preview can't use up the link. */
  async status(token: string): Promise<{ state: LinkState }> {
    const { link, expired } = await this.resolve(token);
    return { state: this.stateOf(link, expired) };
  }

  async sendCode(token: string) {
    const link = await this.usable(token);
    const now = Date.now();
    if (
      link.otpSentAt &&
      now - link.otpSentAt.getTime() < CODE_RESEND_SECONDS * 1000
    )
      throw new HttpException(
        'Wait a minute before asking for another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    if (link.otpSends >= MAX_CODE_SENDS)
      throw new HttpException(
        'Too many codes for this link — ask for a new link',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const contact = await this.contact(link.patientId);
    if (!contact)
      throw new ServiceUnavailableException(
        'We can’t reach you on the details we hold — please contact your lab',
      );
    const code = randomInt(100_000, 1_000_000).toString();
    link.otpHash = this.hashCode(link.jti, code);
    link.otpExpiresAt = new Date(now + CODE_MINUTES * 60_000);
    link.otpSentAt = new Date(now);
    link.otpSends += 1;
    await link.save();
    const sent = await this.deliverCode(contact, code);
    return {
      ...sent,
      expiresInSeconds: CODE_MINUTES * 60,
      // Log-only SMS means the code goes nowhere: local development only.
      ...(!this.isProduction && this.sms.live === false && { devCode: code }),
    };
  }

  private async deliverCode(contact: PatientContact, code: string) {
    const text = `${code} is your Ayuvax verification code. It expires in ${CODE_MINUTES} minutes. Never share it.`;
    if (contact.phone && (this.sms.live !== false || !this.isProduction)) {
      if (await this.sms.send(contact.phone, text))
        return { sentTo: 'sms' as const, masked: maskPhone(contact.phone) };
    }
    if (contact.email) {
      const ok = await this.mail.sendMail(
        contact.email,
        'Your Ayuvax verification code',
        `<p>${text}</p>`,
      );
      if (ok)
        return { sentTo: 'email' as const, masked: maskEmail(contact.email) };
    }
    throw new ServiceUnavailableException(
      'We couldn’t send your code — please try again shortly',
    );
  }

  async verifyCode(token: string, code: string, ip?: string) {
    const link = await this.usable(token);
    if (
      !link.otpHash ||
      !link.otpExpiresAt ||
      link.otpExpiresAt.getTime() <= Date.now()
    )
      throw new BadRequestException('That code has expired — ask for a new one');
    if (!this.sameCode(link.otpHash, this.hashCode(link.jti, code))) {
      link.otpFailures += 1;
      if (link.otpFailures >= MAX_CODE_FAILURES) {
        link.otpFailures = 0;
        link.otpHash = undefined;
        link.otpExpiresAt = undefined;
        link.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        await link.save();
        throw new HttpException(
          `Too many wrong codes — wait ${LOCK_MINUTES} minutes and try again`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await link.save();
      throw new ForbiddenException('That code doesn’t match — check it and try again');
    }
    // One use only, even if two requests arrive together.
    const claimed = await this.links
      .findOneAndUpdate(
        { _id: link._id, usedAt: { $exists: false } },
        {
          $set: { usedAt: new Date() },
          $unset: { otpHash: 1, otpExpiresAt: 1 },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!claimed) throw new GoneException(USED);

    const record = await this.records.findById(link.recordId).exec();
    if (!record) throw new NotFoundException('This report is no longer available');
    const claims: ViewClaims = { purpose: VIEW_PURPOSE, jti: link.jti };
    const viewToken = await this.sign(claims, VIEW_MINUTES * 60);
    await this.audit.record({
      actorId: link.patientId.toString(),
      action: AuditAction.REPORT_LINK_OPENED,
      targetType: 'MedicalRecord',
      targetId: record.id,
      metadata: {
        patientId: link.patientId.toString(),
        channel: link.channel,
        ...(link.providerId && { providerId: link.providerId.toString() }),
      },
      ipAddress: ip,
    });
    return {
      viewToken,
      expiresInSeconds: VIEW_MINUTES * 60,
      report: {
        title: record.systemFileName ?? record.originalFileName,
        providerName: record.providerName ?? null,
        recordDate: record.recordDate?.toISOString() ?? null,
        mimeType: record.mimeType ?? 'application/pdf',
      },
    };
  }

  /** The report file, for the short session that follows a verified code. */
  async file(authorization: string | undefined) {
    const token = authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Sign-in session missing');
    let claims: ViewClaims;
    try {
      claims = await this.jwt.verifyAsync<ViewClaims>(token, {
        secret: this.secret,
        algorithms: [...ALGORITHMS],
      });
    } catch {
      throw new UnauthorizedException(
        'This viewing session has ended — open your link again',
      );
    }
    if (claims.purpose !== VIEW_PURPOSE)
      throw new UnauthorizedException('Invalid session');
    const link = await this.links.findOne({ jti: claims.jti }).exec();
    if (!link?.usedAt) throw new UnauthorizedException('Invalid session');
    const record = await this.records.findById(link.recordId).exec();
    if (!record) throw new NotFoundException('This report is no longer available');
    return {
      buffer: await this.storage.read(record.fileRef),
      mimeType: record.mimeType ?? 'application/pdf',
      fileName: (record.systemFileName ?? 'Ayuva report.pdf').replace(
        /[^a-zA-Z0-9._ -]/g,
        '_',
      ),
    };
  }

  /**
   * Replaces an expired or used link with a new one. The caller sends it only
   * to the details on record; it is never returned to whoever asked.
   */
  async renew(token: string): Promise<{ link: ReportLinkDocument; issued: IssuedLink }> {
    const { link, expired } = await this.resolve(token);
    if (this.stateOf(link, expired) === 'ready')
      throw new ConflictException('This link still works');
    if (link.replacedAt)
      throw new ConflictException(
        'A newer link has already been sent — check your messages',
      );
    if (
      Date.now() - link.firstIssuedAt.getTime() >
        RENEW_DAYS * 86_400_000 ||
      link.renewals >= MAX_RENEWALS
    )
      throw new GoneException(
        'This link can’t be renewed — open the report in the Ayuva app, or ask your lab',
      );
    if (
      link.createdAt &&
      Date.now() - link.createdAt.getTime() < RENEW_WAIT_SECONDS * 1000
    )
      throw new HttpException(
        'Wait a couple of minutes before asking for another link',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const claimed = await this.links
      .findOneAndUpdate(
        { _id: link._id, replacedAt: { $exists: false } },
        { $set: { replacedAt: new Date() } },
      )
      .exec();
    if (!claimed)
      throw new ConflictException(
        'A newer link has already been sent — check your messages',
      );
    const issued = await this.issue({
      recordId: link.recordId,
      patientId: link.patientId,
      providerId: link.providerId,
      channel: link.channel,
      firstIssuedAt: link.firstIssuedAt,
      renewals: link.renewals + 1,
    });
    return { link, issued };
  }

  private sign(claims: LinkClaims | ViewClaims, seconds: number) {
    return this.jwt.signAsync(claims, {
      secret: this.secret,
      expiresIn: seconds,
      algorithm: ALGORITHMS[0],
    } as JwtSignOptions);
  }

  private stateOf(link: ReportLinkDocument, expired: boolean): LinkState {
    if (link.usedAt) return 'used';
    if (expired || link.replacedAt || link.expiresAt.getTime() <= Date.now())
      return 'expired';
    return 'ready';
  }

  private async resolve(token: string) {
    const options = { secret: this.secret, algorithms: [...ALGORITHMS] };
    let claims: LinkClaims;
    let expired = false;
    try {
      claims = await this.jwt.verifyAsync<LinkClaims>(token, options);
    } catch (err) {
      if ((err as Error).name !== 'TokenExpiredError')
        throw new NotFoundException(INVALID);
      claims = await this.jwt.verifyAsync<LinkClaims>(token, {
        ...options,
        ignoreExpiration: true,
      });
      expired = true;
    }
    if (claims.purpose !== LINK_PURPOSE) throw new NotFoundException(INVALID);
    const link = await this.links.findOne({ jti: claims.jti }).exec();
    if (!link) throw new NotFoundException(INVALID);
    return { link, expired };
  }

  /** A link that can still be opened, or the reason it can't. */
  private async usable(token: string): Promise<ReportLinkDocument> {
    const { link, expired } = await this.resolve(token);
    const state = this.stateOf(link, expired);
    if (state !== 'ready') throw new GoneException(state === 'used' ? USED : EXPIRED);
    if (link.lockedUntil && link.lockedUntil.getTime() > Date.now())
      throw new HttpException(
        `Too many wrong codes — wait ${LOCK_MINUTES} minutes and try again`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return link;
  }

  private hashCode(jti: string, code: string): string {
    return createHmac('sha256', this.secret).update(`${jti}:${code}`).digest('hex');
  }

  private sameCode(a: string, b: string): boolean {
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && timingSafeEqual(x, y);
  }
}
