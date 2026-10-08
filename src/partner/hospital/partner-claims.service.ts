import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerPatientsService } from '../clinical/partner-patients.service';
import {
  ClaimStatus,
  InsuranceClaim,
  InsuranceClaimDocument,
} from './schemas/insurance-claim.schema';
import {
  AdmissionDocument,
  PartnerAdmission,
} from './schemas/admission.schema';
import {
  ClaimsQueryDto,
  ClaimStatusDto,
  CreateClaimDto,
  UpdateClaimDto,
} from './dto/hospital.dto';

/** Which status a claim may move to next (TPA queries loop back to submitted; rejections can be appealed). */
const NEXT: Record<ClaimStatus, ClaimStatus[]> = {
  [ClaimStatus.DRAFT]: [ClaimStatus.SUBMITTED],
  [ClaimStatus.SUBMITTED]: [
    ClaimStatus.QUERY,
    ClaimStatus.APPROVED,
    ClaimStatus.PARTIALLY_APPROVED,
    ClaimStatus.REJECTED,
  ],
  [ClaimStatus.QUERY]: [
    ClaimStatus.SUBMITTED,
    ClaimStatus.APPROVED,
    ClaimStatus.PARTIALLY_APPROVED,
    ClaimStatus.REJECTED,
  ],
  [ClaimStatus.APPROVED]: [ClaimStatus.SETTLED],
  [ClaimStatus.PARTIALLY_APPROVED]: [ClaimStatus.SETTLED],
  [ClaimStatus.REJECTED]: [ClaimStatus.SUBMITTED],
  [ClaimStatus.SETTLED]: [],
};

/** Insurance / TPA claims for the Billing & Claims dashboard. */
@Injectable()
export class PartnerClaimsService {
  constructor(
    @InjectModel(InsuranceClaim.name)
    private readonly claimModel: Model<InsuranceClaimDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    private readonly patients: PartnerPatientsService,
    private readonly audit: AuditLogService,
  ) {}

  async list(actor: PartnerActor, q: ClaimsQueryDto) {
    const filter: Record<string, unknown> = { providerId: actor.provider._id };
    if (q.status) filter.status = q.status;
    if (q.q?.trim()) {
      const re = buildSafeRegex(q.q);
      filter.$or = [
        { claimNo: re },
        { patientName: re },
        { payer: re },
        { policyNumber: re },
      ];
    }
    const rows = await this.claimModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(300)
      .exec();
    return rows.map((c) => this.toResponse(c));
  }

  async create(actor: PartnerActor, dto: CreateClaimDto) {
    let patientId: Types.ObjectId | undefined;
    let patientName = dto.patientName?.trim();
    let admission: AdmissionDocument | null = null;
    if (dto.admissionId) {
      admission = Types.ObjectId.isValid(dto.admissionId)
        ? await this.admissionModel.findOne({
            _id: dto.admissionId,
            providerId: actor.provider._id,
          })
        : null;
      if (!admission) throw new NotFoundException('Admission not found');
      patientId = admission.patientId;
      patientName = admission.patientName;
    } else if (dto.patientId) {
      const patient = await this.patients.assertLinked(actor, dto.patientId);
      patientId = patient._id;
      patientName = patient.fullName;
    }
    if (!patientName)
      throw new BadRequestException(
        'Link an admission or patient, or enter the patient’s name',
      );
    const now = new Date();
    const claim = await this.claimModel.create({
      claimNo: await this.newNumber(now),
      providerId: actor.provider._id,
      patientId,
      patientName,
      admissionId: admission?._id,
      payer: dto.payer.trim(),
      policyNumber: dto.policyNumber,
      claimType: dto.claimType ?? 'cashless',
      department: dto.department ?? admission?.department,
      amountClaimed: dto.amountClaimed,
      notes: dto.notes ?? '',
      history: [
        { at: now, status: ClaimStatus.DRAFT, byName: actor.member.fullName },
      ],
    });
    await this.record(actor, claim, {
      change: 'created',
      amount: claim.amountClaimed,
    });
    return this.toResponse(claim);
  }

  async update(actor: PartnerActor, id: string, dto: UpdateClaimDto) {
    const claim = await this.load(actor, id);
    if (claim.status === ClaimStatus.SETTLED)
      throw new BadRequestException('A settled claim can’t be edited');
    if (
      dto.amountClaimed !== undefined &&
      ![ClaimStatus.DRAFT, ClaimStatus.QUERY].includes(claim.status)
    ) {
      throw new BadRequestException(
        'The claimed amount can only change while drafting or answering a query',
      );
    }
    for (const [k, v] of Object.entries(dto))
      if (v !== undefined) claim.set(k, v);
    await claim.save();
    return this.toResponse(claim);
  }

  async setStatus(actor: PartnerActor, id: string, dto: ClaimStatusDto) {
    const claim = await this.load(actor, id);
    if (!NEXT[claim.status].includes(dto.status)) {
      throw new BadRequestException(
        `A ${claim.status.replace('_', ' ')} claim can't move to ${dto.status.replace('_', ' ')}`,
      );
    }
    const now = new Date();
    switch (dto.status) {
      case ClaimStatus.SUBMITTED:
        claim.submittedAt = claim.submittedAt ?? now;
        break;
      case ClaimStatus.APPROVED:
        claim.amountApproved = dto.amountApproved ?? claim.amountClaimed;
        claim.decidedAt = now;
        break;
      case ClaimStatus.PARTIALLY_APPROVED:
        if (dto.amountApproved === undefined)
          throw new BadRequestException('Enter the approved amount');
        if (dto.amountApproved > claim.amountClaimed)
          throw new BadRequestException(
            'Approved amount is above the claimed amount',
          );
        claim.amountApproved = dto.amountApproved;
        claim.decidedAt = now;
        break;
      case ClaimStatus.REJECTED:
        claim.amountApproved = 0;
        claim.decidedAt = now;
        break;
      case ClaimStatus.SETTLED:
        claim.amountSettled =
          dto.amountSettled ?? claim.amountApproved ?? claim.amountClaimed;
        claim.settledAt = now;
        break;
    }
    if (dto.payerClaimRef) claim.payerClaimRef = dto.payerClaimRef;
    claim.status = dto.status;
    claim.history.push({
      at: now,
      status: dto.status,
      byName: actor.member.fullName,
      note: dto.note,
    });
    await claim.save();
    await this.record(actor, claim, {
      change: dto.status,
      amountApproved: claim.amountApproved,
      amountSettled: claim.amountSettled,
    });
    return this.toResponse(claim);
  }

  async summary(providerId: Types.ObjectId) {
    const claims = await this.claimModel
      .find({ providerId })
      .select(
        'status amountClaimed amountApproved amountSettled submittedAt settledAt',
      )
      .lean()
      .exec();
    const sum = (
      pred: (c: (typeof claims)[number]) => boolean,
      pick: (c: (typeof claims)[number]) => number,
    ) => claims.filter(pred).reduce((a, c) => a + pick(c), 0);
    const decided = claims.filter((c) =>
      [
        ClaimStatus.APPROVED,
        ClaimStatus.PARTIALLY_APPROVED,
        ClaimStatus.REJECTED,
        ClaimStatus.SETTLED,
      ].includes(c.status),
    );
    const approved = decided.filter((c) => c.status !== ClaimStatus.REJECTED);
    const settleDays = claims
      .filter((c) => c.settledAt && c.submittedAt)
      .map(
        (c) => (c.settledAt!.getTime() - c.submittedAt!.getTime()) / 86_400_000,
      );
    const byStatus = Object.values(ClaimStatus).map((s) => ({
      status: s,
      count: claims.filter((c) => c.status === s).length,
      amount: sum(
        (c) => c.status === s,
        (c) => c.amountClaimed,
      ),
    }));
    return {
      total: claims.length,
      claimedAmount: sum(
        () => true,
        (c) => c.amountClaimed,
      ),
      inFlightAmount: sum(
        (c) => [ClaimStatus.SUBMITTED, ClaimStatus.QUERY].includes(c.status),
        (c) => c.amountClaimed,
      ),
      awaitingSettlement: sum(
        (c) =>
          [ClaimStatus.APPROVED, ClaimStatus.PARTIALLY_APPROVED].includes(
            c.status,
          ),
        (c) => c.amountApproved ?? 0,
      ),
      settledAmount: sum(
        (c) => c.status === ClaimStatus.SETTLED,
        (c) => c.amountSettled ?? 0,
      ),
      approvalRate: decided.length
        ? Math.round((approved.length / decided.length) * 100)
        : null,
      avgDaysToSettle: settleDays.length
        ? Math.round(
            (settleDays.reduce((a, b) => a + b, 0) / settleDays.length) * 10,
          ) / 10
        : null,
      openQueries: claims.filter((c) => c.status === ClaimStatus.QUERY).length,
      byStatus,
    };
  }

  private async load(actor: PartnerActor, id: string) {
    const c = Types.ObjectId.isValid(id)
      ? await this.claimModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!c) throw new NotFoundException('Claim not found');
    return c;
  }

  private async newNumber(at: Date) {
    const day = at.toISOString().slice(2, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i++) {
      const candidate = `CLM-${day}-${randomBytes(2).toString('hex').toUpperCase()}`;
      if (!(await this.claimModel.exists({ claimNo: candidate })))
        return candidate;
    }
    throw new Error('Could not allocate a claim number');
  }

  private record(
    actor: PartnerActor,
    c: InsuranceClaimDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_CLAIM_UPDATE,
      targetType: 'InsuranceClaim',
      targetId: c.id,
      metadata: {
        providerId: actor.provider.id,
        ...(c.patientId && { patientId: c.patientId.toString() }),
        label: c.claimNo,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(c: InsuranceClaimDocument) {
    return {
      id: c.id,
      claimNo: c.claimNo,
      patientId: c.patientId?.toString() ?? null,
      patientName: c.patientName,
      admissionId: c.admissionId?.toString() ?? null,
      payer: c.payer,
      policyNumber: c.policyNumber ?? null,
      payerClaimRef: c.payerClaimRef ?? null,
      claimType: c.claimType,
      department: c.department ?? null,
      amountClaimed: c.amountClaimed,
      amountApproved: c.amountApproved ?? null,
      amountSettled: c.amountSettled ?? null,
      status: c.status,
      nextStatuses: NEXT[c.status],
      submittedAt: c.submittedAt?.toISOString() ?? null,
      decidedAt: c.decidedAt?.toISOString() ?? null,
      settledAt: c.settledAt?.toISOString() ?? null,
      notes: c.notes,
      history: c.history.map((h) => ({
        at: h.at.toISOString(),
        status: h.status,
        byName: h.byName ?? null,
        note: h.note ?? null,
      })),
      createdAt: (c.createdAt ?? new Date()).toISOString(),
      updatedAt: (c.updatedAt ?? new Date()).toISOString(),
    };
  }
}
