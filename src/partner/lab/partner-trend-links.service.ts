import {
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../../core/health-profile/schemas/health-profile.schema';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { LabOrderDocument } from './schemas/lab-order.schema';
import { LabResult, LabResultDocument } from './schemas/lab-result.schema';
import { TrendLink, TrendLinkDocument } from './schemas/trend-link.schema';
import { numericValue } from './result-checks';

const LINK_DAYS = 90;
const MAX_TRIES = 5;
const LOCK_MIN = 15;
const HISTORY_YEARS = 2;

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

type Check = 'phone' | 'birth_year';

/**
 * "Your results over time": a mobile web page per released report, with
 * trend graphs of every marker the patient has had at this lab.
 */
@Injectable()
export class PartnerTrendLinksService {
  constructor(
    @InjectModel(TrendLink.name)
    private readonly linkModel: Model<TrendLinkDocument>,
    @InjectModel(LabResult.name)
    private readonly resultModel: Model<LabResultDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(HealthProfile.name)
    private readonly profileModel: Model<HealthProfileDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    private readonly config: ConfigService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * A fresh link for an order's report (earlier links for it stop working).
   * Null when the patient has no mobile number or birth date on record:
   * without one the link couldn't be protected, so none is made.
   */
  async create(actor: PartnerActor, order: LabOrderDocument) {
    if (!(await this.checkFor(order.patientId))) return null;
    await this.linkModel.updateMany(
      { orderId: order._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000);
    await this.linkModel.create({
      providerId: actor.provider._id,
      patientId: order.patientId,
      orderId: order._id,
      tokenHash: hash(token),
      expiresAt,
      createdByName: actor.member.fullName,
    });
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_LAB_REPORT_RELEASE,
      targetType: 'PartnerLabOrder',
      targetId: order.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: order.patientId.toString(),
        label: `${order.orderNo} · patient trend link created (valid ${LINK_DAYS} days)`,
      },
      ipAddress: actor.ip,
    });
    return { url: this.url(token), expiresAt: expiresAt.toISOString() };
  }

  async revoke(actor: PartnerActor, order: LabOrderDocument) {
    const r = await this.linkModel.updateMany(
      {
        orderId: order._id,
        providerId: actor.provider._id,
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date() } },
    );
    return { revoked: r.modifiedCount };
  }

  /** What the page shows before the patient proves who they are: no patient details. */
  async info(token: string) {
    const link = await this.live(token);
    const provider = await this.providerModel
      .findById(link.providerId)
      .select('name')
      .lean()
      .exec();
    return {
      labName: provider?.name ?? 'Your lab',
      check: (await this.checkFor(link.patientId)) ?? 'phone',
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  async open(token: string, answer: string) {
    const link = await this.live(token);
    if (link.lockedUntil && link.lockedUntil > new Date())
      throw new HttpException(
        `Too many tries — wait ${LOCK_MIN} minutes and try again`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const check = await this.checkFor(link.patientId);
    const expected = await this.expected(link.patientId, check);
    const given = answer.replace(/\D/g, '');
    if (!expected || given !== expected) {
      link.failedChecks += 1;
      if (link.failedChecks >= MAX_TRIES) {
        link.failedChecks = 0;
        link.lockedUntil = new Date(Date.now() + LOCK_MIN * 60_000);
      }
      await link.save();
      throw new ForbiddenException(
        check === 'birth_year'
          ? 'That year doesn’t match our records'
          : 'Those digits don’t match the mobile number on record',
      );
    }
    link.failedChecks = 0;
    link.lockedUntil = undefined;
    link.views += 1;
    link.lastViewedAt = new Date();
    await link.save();
    return this.trends(link);
  }

  private async trends(link: TrendLinkDocument) {
    const [provider, user, results] = await Promise.all([
      this.providerModel
        .findById(link.providerId)
        .select('name phone')
        .lean()
        .exec(),
      this.userModel.findById(link.patientId).select('fullName').lean().exec(),
      this.resultModel
        .find({
          providerId: link.providerId,
          patientId: link.patientId,
          status: 'released',
          releasedAt: {
            $gte: new Date(Date.now() - HISTORY_YEARS * 365 * 86_400_000),
          },
        })
        .sort({ releasedAt: 1 })
        .exec(),
    ]);
    const series = new Map<
      string,
      {
        parameter: string;
        unit: string | null;
        refLow: number | null;
        refHigh: number | null;
        points: { at: string; value: number; flag: string }[];
      }
    >();
    for (const r of results)
      for (const t of r.tests)
        for (const v of t.values) {
          const value = numericValue(v.value ?? '');
          if (value === null) continue;
          const key = `${v.name.toLowerCase()}|${(v.unit ?? '').toLowerCase()}`;
          const s = series.get(key) ?? {
            parameter: v.name,
            unit: v.unit ?? null,
            refLow: v.refLow ?? null,
            refHigh: v.refHigh ?? null,
            points: [],
          };
          s.refLow = v.refLow ?? s.refLow;
          s.refHigh = v.refHigh ?? s.refHigh;
          s.points.push({
            at: (r.releasedAt ?? r.createdAt ?? new Date()).toISOString(),
            value,
            flag: v.flag,
          });
          series.set(key, s);
        }
    const thisReport = results.find((r) => r.orderId.equals(link.orderId));
    const inReport = new Set(
      (thisReport?.tests ?? []).flatMap((t) =>
        t.values.map((v) => v.name.toLowerCase()),
      ),
    );
    return {
      labName: provider?.name ?? 'Your lab',
      labPhone: provider?.phone ?? null,
      firstName: (user?.fullName ?? '').split(' ')[0] || null,
      reportDate: thisReport?.releasedAt?.toISOString() ?? null,
      reports: results.length,
      // This report's markers first, then anything else measured before.
      series: [...series.values()].sort(
        (a, b) =>
          Number(inReport.has(b.parameter.toLowerCase())) -
            Number(inReport.has(a.parameter.toLowerCase())) ||
          b.points.length - a.points.length ||
          a.parameter.localeCompare(b.parameter),
      ),
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  private async live(token: string) {
    const link = await this.linkModel
      .findOne({ tokenHash: hash(token) })
      .exec();
    if (!link) throw new NotFoundException('This link isn’t valid');
    if (link.revokedAt || link.expiresAt < new Date())
      throw new GoneException(
        'This link has expired — ask the lab for a new one, or open the report in the Ayuva app',
      );
    return link;
  }

  /** How the patient proves it's them: mobile number digits, else birth year; null when neither is on record. */
  private async checkFor(patientId: Types.ObjectId): Promise<Check | null> {
    if (await this.expected(patientId, 'phone')) return 'phone';
    if (await this.expected(patientId, 'birth_year')) return 'birth_year';
    return null;
  }

  private async expected(patientId: Types.ObjectId, check: Check | null) {
    if (check === 'phone') {
      const u = await this.userModel
        .findById(patientId)
        .select('phone')
        .lean()
        .exec();
      const digits = (u?.phone ?? '').replace(/\D/g, '');
      return digits.length >= 6 ? digits.slice(-4) : null;
    }
    if (check === 'birth_year') {
      const p = await this.profileModel
        .findOne({ userId: patientId })
        .select('dateOfBirth')
        .lean()
        .exec();
      return p?.dateOfBirth
        ? String(new Date(p.dateOfBirth).getUTCFullYear())
        : null;
    }
    return null;
  }

  private url(token: string) {
    return `${this.config.get<string>('frontend.url') ?? ''}/r/${token}`;
  }
}
