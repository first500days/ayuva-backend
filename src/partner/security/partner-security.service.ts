import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccessLog,
  AccessLogDocument,
} from '../../core/sharing/schemas/access-log.schema';
import {
  ShareGrant,
  ShareGrantDocument,
} from '../../core/sharing/schemas/share-grant.schema';
import {
  ShareOrganisation,
  ShareOrganisationDocument,
} from '../../core/sharing/schemas/share-organisation.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import {
  AuditAction,
  AuditLog,
  AuditLogDocument,
} from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import { roleLabel } from '../rbac/partner-permissions';

export type ActivityCategory =
  'record_access' | 'clinical' | 'operations' | 'admin' | 'login';

export interface ActivityQuery {
  memberId?: string;
  patientId?: string;
  category?: ActivityCategory;
  from?: string;
  to?: string;
  limit?: number;
}

export interface ActivityRow {
  id: string;
  at: string;
  category: ActivityCategory;
  action: string;
  label: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: string | null;
  patientId: string | null;
  patientName: string | null;
  target: string | null;
  ip: string | null;
}

const ACTION_META: Partial<
  Record<AuditAction, { category: ActivityCategory; label: string }>
> = {
  [AuditAction.LOGIN]: { category: 'login', label: 'Signed in' },
  [AuditAction.PARTNER_REGISTER]: {
    category: 'admin',
    label: 'Registered the organisation',
  },
  [AuditAction.PARTNER_PATIENT_VIEW]: {
    category: 'record_access',
    label: 'Opened patient timeline',
  },
  [AuditAction.PARTNER_IMAGING_VIEW]: {
    category: 'record_access',
    label: 'Viewed imaging study',
  },
  [AuditAction.PARTNER_NOTE_SIGN]: {
    category: 'clinical',
    label: 'Signed consultation note',
  },
  [AuditAction.PARTNER_NOTE_SHARE]: {
    category: 'clinical',
    label: "Sent visit summary to patient's vault",
  },
  [AuditAction.PARTNER_RX_SIGN]: {
    category: 'clinical',
    label: 'Signed e-prescription',
  },
  [AuditAction.PARTNER_RX_CANCEL]: {
    category: 'clinical',
    label: 'Cancelled e-prescription',
  },
  [AuditAction.PARTNER_REFERRAL_CREATE]: {
    category: 'clinical',
    label: 'Sent referral',
  },
  [AuditAction.PARTNER_REFERRAL_UPDATE]: {
    category: 'clinical',
    label: 'Updated referral',
  },
  [AuditAction.PARTNER_LAB_REPORT_RELEASE]: {
    category: 'clinical',
    label: 'Released lab report',
  },
  [AuditAction.PARTNER_APPOINTMENT_UPDATE]: {
    category: 'operations',
    label: 'Updated appointment',
  },
  [AuditAction.PARTNER_LAB_ORDER_UPDATE]: {
    category: 'operations',
    label: 'Updated lab order',
  },
  [AuditAction.PARTNER_ADMISSION_UPDATE]: {
    category: 'operations',
    label: 'Updated admission',
  },
  [AuditAction.PARTNER_CLAIM_UPDATE]: {
    category: 'operations',
    label: 'Updated insurance claim',
  },
  [AuditAction.PARTNER_STAFF_INVITE]: {
    category: 'admin',
    label: 'Invited staff member',
  },
  [AuditAction.PARTNER_STAFF_UPDATE]: {
    category: 'admin',
    label: 'Changed staff member',
  },
  [AuditAction.PARTNER_STAFF_SUSPEND]: {
    category: 'admin',
    label: 'Suspended / reactivated staff',
  },
  [AuditAction.PARTNER_STAFF_ACCEPT]: {
    category: 'admin',
    label: 'Joined the organisation',
  },
  [AuditAction.PARTNER_SETTINGS_UPDATE]: {
    category: 'admin',
    label: 'Changed organisation settings',
  },
};

const MAX_PER_SOURCE = 1000;

/**
 * "Security & Logs": who in the organisation accessed which patient's data
 * and when (HIPAA access accounting / GDPR Art. 30), plus staff, clinical and
 * operational actions. Read-only over the platform's append-only logs.
 */
@Injectable()
export class PartnerSecurityService {
  constructor(
    @InjectModel(AccessLog.name)
    private readonly accessModel: Model<AccessLogDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    @InjectModel(ShareGrant.name)
    private readonly grantModel: Model<ShareGrantDocument>,
    @InjectModel(ShareOrganisation.name)
    private readonly orgModel: Model<ShareOrganisationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
  ) {}

  async activity(
    actor: PartnerActor,
    q: ActivityQuery,
  ): Promise<ActivityRow[]> {
    const members = await this.memberModel
      .find({ providerId: actor.provider._id })
      .exec();
    const memberByUser = new Map(members.map((m) => [m.userId.toString(), m]));
    let actorIds = members.map((m) => m.userId);
    if (q.memberId) {
      const m = members.find((x) => x.id === q.memberId);
      actorIds = m ? [m.userId] : [];
    }
    const range = this.range(q.from, q.to);
    const wantsAccess = !q.category || q.category === 'record_access';

    // 1. Patient-record views/downloads through share grants (attributable to a login since P04).
    let accessRows: AccessLogDocument[] = [];
    if (wantsAccess && actorIds.length) {
      const grantIds = await this.orgGrantIds(actor.provider._id);
      accessRows = await this.accessModel
        .find({
          grantId: { $in: grantIds },
          viewerUserId: { $in: actorIds },
          ...(q.patientId &&
            Types.ObjectId.isValid(q.patientId) && {
              userId: new Types.ObjectId(q.patientId),
            }),
          ...(range && { occurredAt: range }),
        })
        .sort({ occurredAt: -1 })
        .limit(MAX_PER_SOURCE)
        .exec();
    }

    // 2. Everything else members did, from the audit log. Record downloads are
    //    already in (1), with the patient attached, so they're skipped here.
    const actions = (Object.keys(ACTION_META) as AuditAction[]).filter(
      (a) => !q.category || ACTION_META[a]!.category === q.category,
    );
    const auditRows =
      actorIds.length && actions.length
        ? await this.auditModel
            .find({
              actorId: { $in: actorIds },
              action: { $in: actions },
              ...(q.patientId && { 'metadata.patientId': q.patientId }),
              ...(range && { createdAt: range }),
            })
            .sort({ createdAt: -1 })
            .limit(MAX_PER_SOURCE)
            .exec()
        : [];

    const patientIds = new Set<string>();
    accessRows.forEach((r) => patientIds.add(r.userId.toString()));
    auditRows.forEach((r) => {
      const pid = r.metadata?.patientId;
      if (typeof pid === 'string' && Types.ObjectId.isValid(pid))
        patientIds.add(pid);
    });
    const patients = await this.userModel
      .find({
        _id: { $in: [...patientIds].map((id) => new Types.ObjectId(id)) },
      })
      .select('fullName')
      .lean()
      .exec();
    const patientName = new Map(
      patients.map((p) => [p._id.toString(), p.fullName]),
    );

    const describeActor = (
      userId?: Types.ObjectId | null,
      fallback?: string,
    ) => {
      const m = userId ? memberByUser.get(userId.toString()) : undefined;
      return {
        actorUserId: userId?.toString() ?? null,
        actorName: m?.fullName ?? fallback ?? 'Unknown user',
        actorRole: m ? roleLabel(actor.orgType, m.role) : null,
      };
    };

    const rows: ActivityRow[] = [
      ...accessRows.map((r): ActivityRow => ({
        id: `a_${r.id}`,
        at: (r.occurredAt ?? new Date()).toISOString(),
        category: 'record_access',
        action: `record_${r.action}`,
        label:
          r.action === 'downloaded'
            ? 'Downloaded shared record'
            : 'Viewed shared records',
        ...describeActor(r.viewerUserId, r.viewerName),
        patientId: r.userId.toString(),
        patientName: patientName.get(r.userId.toString()) ?? 'Patient',
        target: r.recordTitle,
        ip: null,
      })),
      ...auditRows.map((r): ActivityRow => {
        const meta = ACTION_META[r.action]!;
        const pid =
          typeof r.metadata?.patientId === 'string'
            ? r.metadata.patientId
            : null;
        return {
          id: `l_${r.id}`,
          at: (r.createdAt ?? new Date()).toISOString(),
          category: meta.category,
          action: r.action,
          label: meta.label,
          ...describeActor(r.actorId),
          patientId: pid,
          patientName: pid ? (patientName.get(pid) ?? 'Patient') : null,
          target: this.describeTarget(r),
          ip: r.ipAddress ?? null,
        };
      }),
    ];
    rows.sort((a, b) => b.at.localeCompare(a.at));
    return rows.slice(0, Math.min(Math.max(q.limit ?? 300, 1), 1000));
  }

  /** 30-day headline numbers for the Security & Logs page. */
  async summary(actor: PartnerActor) {
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const rows = await this.activity(actor, { from, limit: 1000 });
    const access = rows.filter((r) => r.category === 'record_access');
    const byActor = new Map<
      string,
      { name: string; role: string | null; count: number }
    >();
    for (const r of access) {
      const key = r.actorUserId ?? r.actorName;
      const e = byActor.get(key) ?? {
        name: r.actorName,
        role: r.actorRole,
        count: 0,
      };
      e.count += 1;
      byActor.set(key, e);
    }
    return {
      windowDays: 30,
      recordViews: access.filter((r) => r.action !== 'record_downloaded')
        .length,
      recordDownloads: access.filter((r) => r.action === 'record_downloaded')
        .length,
      patientsAccessed: new Set(access.map((r) => r.patientId).filter(Boolean))
        .size,
      logins: rows.filter((r) => r.category === 'login').length,
      clinicalActions: rows.filter((r) => r.category === 'clinical').length,
      adminChanges: rows.filter((r) => r.category === 'admin').length,
      topAccessors: [...byActor.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    };
  }

  private async orgGrantIds(providerId: Types.ObjectId): Promise<string[]> {
    const orgs = await this.orgModel
      .find({ providerId })
      .select('_id')
      .lean()
      .exec();
    const grants = await this.grantModel
      .find({ organisationId: { $in: orgs.map((o) => o._id.toString()) } })
      .select('_id')
      .lean()
      .exec();
    return grants.map((g) => g._id.toString());
  }

  private range(from?: string, to?: string) {
    const r: { $gte?: Date; $lte?: Date } = {};
    if (from && !Number.isNaN(Date.parse(from))) r.$gte = new Date(from);
    if (to && !Number.isNaN(Date.parse(to))) r.$lte = new Date(to);
    return r.$gte || r.$lte ? r : undefined;
  }

  private describeTarget(r: AuditLogDocument): string | null {
    const m = r.metadata ?? {};
    const pick = (k: string) => (typeof m[k] === 'string' ? m[k] : undefined);
    return (
      pick('label') ??
      pick('memberName') ??
      pick('change') ??
      (r.action === AuditAction.LOGIN ? 'Partner Portal' : r.targetType)
    );
  }
}
