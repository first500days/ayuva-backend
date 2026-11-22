import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { LiveBus } from '../../common/live/live-bus.service';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { resolveDiagnosisCodes } from '../clinical/diagnosis-codes';
import {
  ConsultationNote,
  ConsultationNoteDocument,
  NoteStatus,
} from '../clinical/schemas/consultation-note.schema';
import {
  Referral,
  ReferralDocument,
  ReferralType,
} from './schemas/referral.schema';
import {
  PriorAuth,
  PriorAuthDocument,
  PriorAuthStatus,
} from './schemas/prior-auth.schema';
import { draftPriorAuth, TextSource } from './prior-auth-draft';
import {
  PriorAuthDecisionDto,
  PriorAuthQueryDto,
  UpdatePriorAuthDto,
} from './dto/prior-auth.dto';

const AUTO_DRAFTER = 'Ayuva rules (automatic)';

/**
 * Insurance pre-authorisation for referred patients, clinician-in-the-loop:
 * the rules draft the request from the referral and notes, the hospital's
 * insurance desk corrects and approves it, and only then does it go to the
 * payer. With PRIOR_AUTH_GATEWAY_URL set (an NHCX / TPA gateway the hospital
 * has an account with) approval sends it there in the background; without
 * one it waits as "ready" for the desk to submit on the payer's portal.
 */
@Injectable()
export class PartnerPriorAuthService {
  private readonly logger = new Logger(PartnerPriorAuthService.name);

  constructor(
    @InjectModel(PriorAuth.name)
    private readonly model: Model<PriorAuthDocument>,
    @InjectModel(Referral.name)
    private readonly referralModel: Model<ReferralDocument>,
    @InjectModel(ConsultationNote.name)
    private readonly noteModel: Model<ConsultationNoteDocument>,
    private readonly audit: AuditLogService,
    private readonly config: ConfigService,
    private readonly live: LiveBus,
  ) {}

  async list(actor: PartnerActor, q: PriorAuthQueryDto) {
    const filter: Record<string, unknown> = { providerId: actor.provider._id };
    if (q.referralId && Types.ObjectId.isValid(q.referralId))
      filter.referralId = new Types.ObjectId(q.referralId);
    if (q.status) filter.status = q.status;
    const rows = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
    return rows.map((r) => this.toResponse(r));
  }

  async get(actor: PartnerActor, id: string) {
    return this.toResponse(await this.load(actor, id));
  }

  /**
   * Drafts (or re-drafts) the request for an incoming referral. A request that
   * has been approved is never redrafted. Desk entries survive a redraft.
   */
  async draftForReferral(
    actor: PartnerActor,
    referralId: string,
    opts: { auto?: boolean } = {},
  ) {
    if (!Types.ObjectId.isValid(referralId))
      throw new NotFoundException('Referral not found');
    const referral = await this.referralModel
      .findOne({ _id: referralId, toProviderId: actor.provider._id })
      .exec();
    if (!referral) throw new NotFoundException('Referral not found');
    const existing = await this.model
      .findOne({
        providerId: actor.provider._id,
        referralId: referral._id,
        status: { $ne: PriorAuthStatus.CANCELLED },
      })
      .exec();
    if (existing && existing.status !== PriorAuthStatus.DRAFT)
      return this.toResponse(existing);

    const notes = await this.noteModel
      .find({
        providerId: actor.provider._id,
        patientId: referral.patientId,
        status: NoteStatus.SIGNED,
      })
      .sort({ signedAt: -1 })
      .limit(3)
      .exec();
    const sources: TextSource[] = [
      { label: 'Referral reason', text: referral.reason },
      { label: 'Clinical summary', text: referral.clinicalSummary },
      { label: 'Requested tests', text: referral.requestedTests.join(', ') },
      ...notes.map((n, i) => ({
        label: i === 0 ? 'Latest signed note' : 'Earlier signed note',
        // Plain object: a Mongoose subdocument's own keys include its internals.
        text: Object.values(
          (n.toObject().sections ?? {}) as unknown as Record<string, unknown>,
        )
          .filter((v): v is string => typeof v === 'string')
          .join('\n'),
      })),
    ];
    const draft = draftPriorAuth(sources, {
      admission: referral.type === ReferralType.ADMISSION,
      payer: existing?.payer,
      policyNumber: existing?.policyNumber,
      estimatedAmount: existing?.estimatedAmount,
    });
    const byName = opts.auto ? AUTO_DRAFTER : actor.member.fullName;
    const doc =
      existing ??
      new this.model({
        providerId: actor.provider._id,
        referralId: referral._id,
        patientId: referral.patientId,
        patientName: referral.patientName,
        requestNo: requestNo(new Date()),
      });
    const codes = new Map(
      (existing?.procedures ?? []).map((p) => [p.name, p.packageCode]),
    );
    doc.diagnoses = draft.diagnoses;
    doc.procedures = draft.procedures.map((p) => ({
      name: p.name,
      evidence: p.evidence,
      packageCode: codes.get(p.name),
    }));
    if (doc.stayDays === undefined && draft.suggestedStayDays !== null)
      doc.stayDays = draft.suggestedStayDays;
    if (!doc.clinicalSummary)
      doc.clinicalSummary = [referral.reason, referral.clinicalSummary]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 4000);
    doc.draftedAt = new Date();
    doc.draftSources = sources
      .filter((s) => s.text?.trim())
      .map((s) => s.label);
    doc.history.push({
      at: new Date(),
      status: existing ? 'redrafted' : 'drafted',
      byName,
      note: `${draft.diagnoses.length} diagnosis code${draft.diagnoses.length === 1 ? '' : 's'} and ${draft.procedures.length} procedure${draft.procedures.length === 1 ? '' : 's'} found in ${doc.draftSources.join(', ') || 'no text'}`,
    });
    await doc.save();
    await this.record(actor, doc, {
      change: existing ? 'redrafted' : 'drafted',
      automatic: !!opts.auto,
      diagnoses: doc.diagnoses.map((d) => d.icd11),
    });
    this.live.publish(actor.provider._id, 'referrals');
    return this.toResponse(doc, draft.missing);
  }

  /** Desk edits while it is still a draft. Diagnoses come from the catalogue only. */
  async update(actor: PartnerActor, id: string, dto: UpdatePriorAuthDto) {
    const doc = await this.load(actor, id);
    if (doc.status !== PriorAuthStatus.DRAFT)
      throw new BadRequestException(
        'Only a draft can be edited — cancel it and draft again',
      );
    if (dto.diagnosisCodes) {
      const evidence = new Map(doc.diagnoses.map((d) => [d.icd11, d.evidence]));
      doc.diagnoses = resolveDiagnosisCodes(dto.diagnosisCodes).map((d) => ({
        ...d,
        evidence: evidence.get(d.icd11),
      }));
    }
    if (dto.procedures)
      doc.procedures = dto.procedures.map((p) => ({
        name: p.name.trim(),
        packageCode: p.packageCode?.trim() || undefined,
        evidence: doc.procedures.find((x) => x.name === p.name)?.evidence,
      }));
    for (const k of [
      'payer',
      'tpaName',
      'policyNumber',
      'clinicalSummary',
    ] as const)
      if (dto[k] !== undefined) doc.set(k, dto[k]?.trim() || undefined);
    if (dto.stayDays !== undefined) doc.stayDays = dto.stayDays;
    if (dto.estimatedAmount !== undefined)
      doc.estimatedAmount = dto.estimatedAmount;
    await doc.save();
    await this.record(actor, doc, {
      change: 'edited',
      fields: Object.keys(dto),
    });
    return this.toResponse(doc);
  }

  /**
   * The human step: a named person on the desk confirms the codes and amounts.
   * Only then is the request sent (to the gateway if there is one).
   */
  async approve(actor: PartnerActor, id: string, attest: boolean) {
    const doc = await this.load(actor, id);
    if (doc.status !== PriorAuthStatus.DRAFT)
      throw new BadRequestException('This request has already been approved');
    if (!attest)
      throw new BadRequestException(
        'Confirm that you checked the codes, amounts and summary against the notes',
      );
    const gaps = [
      !doc.diagnoses.length && 'at least one diagnosis code',
      !doc.payer && 'the insurer',
      !doc.policyNumber && 'the policy or member ID',
      !doc.estimatedAmount && 'the estimated cost',
    ].filter(Boolean);
    if (gaps.length)
      throw new BadRequestException(`Add ${gaps.join(', ')} before approving`);
    const now = new Date();
    doc.status = PriorAuthStatus.READY;
    doc.approvedAt = now;
    doc.approvedByName = actor.member.fullName;
    doc.approvedByMemberId = actor.member._id;
    doc.history.push({
      at: now,
      status: 'approved',
      byName: actor.member.fullName,
      note: 'Checked and approved for sending',
    });
    await doc.save();
    await this.record(actor, doc, {
      change: 'approved',
      // Audit rows are hash-sealed: this is the immutable human-approval entry.
      validation: {
        action: 'MANUALLY_AUTHORIZED_PRIOR_AUTH',
        state: 'Approved',
        userId: actor.userId,
        timestamp: now.toISOString(),
      },
    });
    if (this.gateway()) void this.submitToGateway(actor, doc.id);
    this.live.publish(actor.provider._id, 'referrals');
    return this.toResponse(doc);
  }

  /** The desk submitted it on the payer's own portal. */
  async markSubmitted(actor: PartnerActor, id: string, payerRef?: string) {
    const doc = await this.load(actor, id);
    if (doc.status !== PriorAuthStatus.READY)
      throw new BadRequestException('Approve the request before submitting it');
    doc.status = PriorAuthStatus.SUBMITTED;
    doc.submittedAt = new Date();
    doc.submittedVia = 'manual';
    if (payerRef?.trim()) doc.payerRef = payerRef.trim();
    doc.history.push({
      at: doc.submittedAt,
      status: 'submitted',
      byName: actor.member.fullName,
      note: payerRef?.trim() ? `Payer reference ${payerRef.trim()}` : undefined,
    });
    await doc.save();
    await this.record(actor, doc, { change: 'submitted', via: 'manual' });
    this.live.publish(actor.provider._id, 'referrals');
    return this.toResponse(doc);
  }

  async recordDecision(
    actor: PartnerActor,
    id: string,
    dto: PriorAuthDecisionDto,
  ) {
    const doc = await this.load(actor, id);
    if (
      ![PriorAuthStatus.SUBMITTED, PriorAuthStatus.QUERY].includes(doc.status)
    )
      throw new BadRequestException(
        'Record the payer’s answer once it has been submitted',
      );
    const status = {
      approved: PriorAuthStatus.APPROVED,
      query: PriorAuthStatus.QUERY,
      rejected: PriorAuthStatus.REJECTED,
    }[dto.decision];
    doc.status = status;
    doc.decidedAt = new Date();
    if (dto.payerRef?.trim()) doc.payerRef = dto.payerRef.trim();
    if (dto.amountApproved !== undefined)
      doc.amountApproved = dto.amountApproved;
    doc.history.push({
      at: doc.decidedAt,
      status: `payer_${dto.decision}`,
      byName: actor.member.fullName,
      note: dto.note?.trim() || undefined,
    });
    await doc.save();
    await this.record(actor, doc, {
      change: `payer_${dto.decision}`,
      ...(dto.amountApproved !== undefined && {
        amountApproved: dto.amountApproved,
      }),
    });
    this.live.publish(actor.provider._id, 'referrals');
    return this.toResponse(doc);
  }

  async cancel(actor: PartnerActor, id: string, note?: string) {
    const doc = await this.load(actor, id);
    if (
      [PriorAuthStatus.APPROVED, PriorAuthStatus.CANCELLED].includes(doc.status)
    )
      throw new BadRequestException(
        `A ${doc.status} request can't be cancelled`,
      );
    doc.status = PriorAuthStatus.CANCELLED;
    doc.history.push({
      at: new Date(),
      status: 'cancelled',
      byName: actor.member.fullName,
      note: note?.trim() || undefined,
    });
    await doc.save();
    await this.record(actor, doc, { change: 'cancelled' });
    this.live.publish(actor.provider._id, 'referrals');
    return this.toResponse(doc);
  }

  /** The request as a FHIR R4 Claim with use "preauthorization", the shape NHCX gateways take. */
  async packet(actor: PartnerActor, id: string) {
    const doc = await this.load(actor, id);
    return this.fhirClaim(doc, actor.provider.name);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private gateway(): { url: string; token?: string } | null {
    const url = this.config.get<string>('PRIOR_AUTH_GATEWAY_URL');
    if (!url || !/^https:\/\//i.test(url)) return null;
    return { url, token: this.config.get<string>('PRIOR_AUTH_GATEWAY_TOKEN') };
  }

  /** Runs after approval without holding up the response; the result lands in the history. */
  private async submitToGateway(actor: PartnerActor, id: string) {
    const gw = this.gateway();
    const doc = await this.model.findById(id).exec();
    if (!gw || !doc || doc.status !== PriorAuthStatus.READY) return;
    let note: string;
    try {
      const res = await fetch(gw.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json',
          ...(gw.token && { Authorization: `Bearer ${gw.token}` }),
        },
        body: JSON.stringify(this.fhirClaim(doc, actor.provider.name)),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const body = (await res.json().catch(() => ({}))) as { id?: unknown };
        doc.status = PriorAuthStatus.SUBMITTED;
        doc.submittedAt = new Date();
        doc.submittedVia = 'gateway';
        if (typeof body.id === 'string') doc.payerRef = body.id.slice(0, 80);
        note = 'Sent to the payer gateway';
      } else
        note = `Payer gateway answered HTTP ${res.status} — submit it on the payer portal`;
    } catch (err) {
      this.logger.error(
        `Prior-auth ${doc.requestNo} gateway send failed`,
        err as Error,
      );
      note = 'Payer gateway unreachable — submit it on the payer portal';
    }
    doc.history.push({
      at: new Date(),
      status:
        doc.status === PriorAuthStatus.SUBMITTED
          ? 'submitted'
          : 'gateway_failed',
      byName: 'Ayuva',
      note,
    });
    await doc.save();
    this.live.publish(doc.providerId, 'referrals');
  }

  private fhirClaim(doc: PriorAuthDocument, orgName: string) {
    return {
      resourceType: 'Claim',
      use: 'preauthorization',
      status: 'active',
      identifier: [
        { system: 'https://ayuva.health/prior-auth', value: doc.requestNo },
      ],
      created: (doc.approvedAt ?? doc.createdAt ?? new Date()).toISOString(),
      type: { coding: [{ code: 'institutional' }] },
      provider: { display: orgName },
      patient: { display: doc.patientName },
      priority: { coding: [{ code: 'normal' }] },
      insurance: [
        {
          sequence: 1,
          focal: true,
          coverage: { display: doc.payer ?? '' },
          identifier: { value: doc.policyNumber ?? '' },
          ...(doc.tpaName && { businessArrangement: doc.tpaName }),
        },
      ],
      diagnosis: doc.diagnoses.map((d, i) => ({
        sequence: i + 1,
        diagnosisCodeableConcept: {
          coding: [
            {
              system: 'http://id.who.int/icd/release/11/mms',
              code: d.icd11,
              display: d.display,
            },
            {
              system: 'http://snomed.info/sct',
              code: d.snomed,
              display: d.display,
            },
          ],
        },
      })),
      procedure: doc.procedures.map((p, i) => ({
        sequence: i + 1,
        procedureCodeableConcept: {
          text: p.name,
          ...(p.packageCode && { coding: [{ code: p.packageCode }] }),
        },
      })),
      supportingInfo: [
        ...(doc.stayDays !== undefined
          ? [
              {
                sequence: 1,
                category: { text: 'expected-length-of-stay' },
                valueQuantity: { value: doc.stayDays, unit: 'd' },
              },
            ]
          : []),
        {
          sequence: 2,
          category: { text: 'clinical-summary' },
          valueString: doc.clinicalSummary,
        },
      ],
      total: { value: doc.estimatedAmount ?? 0, currency: 'INR' },
    };
  }

  private async load(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Pre-authorisation not found');
    const doc = await this.model
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!doc) throw new NotFoundException('Pre-authorisation not found');
    return doc;
  }

  private record(
    actor: PartnerActor,
    doc: PriorAuthDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_CLAIM_UPDATE,
      targetType: 'PriorAuth',
      targetId: doc.id,
      metadata: {
        providerId: actor.provider.id,
        patientId: doc.patientId.toString(),
        label: doc.requestNo,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }

  toResponse(d: PriorAuthDocument, missing?: string[]) {
    const iso = (x?: Date) => x?.toISOString() ?? null;
    return {
      id: d.id,
      requestNo: d.requestNo,
      referralId: d.referralId?.toString() ?? null,
      patientId: d.patientId.toString(),
      patientName: d.patientName,
      status: d.status,
      payer: d.payer ?? null,
      tpaName: d.tpaName ?? null,
      policyNumber: d.policyNumber ?? null,
      diagnoses: d.diagnoses.map((x) => ({
        icd11: x.icd11,
        snomed: x.snomed,
        display: x.display,
        evidence: x.evidence ?? null,
      })),
      procedures: d.procedures.map((p) => ({
        name: p.name,
        packageCode: p.packageCode ?? null,
        evidence: p.evidence ?? null,
      })),
      stayDays: d.stayDays ?? null,
      estimatedAmount: d.estimatedAmount ?? null,
      clinicalSummary: d.clinicalSummary,
      draftedAt: iso(d.draftedAt),
      draftSources: d.draftSources,
      approvedAt: iso(d.approvedAt),
      approvedByName: d.approvedByName ?? null,
      submittedAt: iso(d.submittedAt),
      submittedVia: d.submittedVia ?? null,
      payerRef: d.payerRef ?? null,
      amountApproved: d.amountApproved ?? null,
      decidedAt: iso(d.decidedAt),
      gatewayConfigured: !!this.gateway(),
      missing:
        missing ??
        [
          !d.diagnoses.length && 'A coded diagnosis',
          !d.payer && 'Insurer / TPA',
          !d.policyNumber && 'Policy or member ID',
          !d.estimatedAmount && 'Estimated cost',
        ].filter((x): x is string => !!x),
      history: d.history.map((h) => ({
        at: h.at.toISOString(),
        status: h.status,
        byName: h.byName ?? null,
        note: h.note ?? null,
      })),
      createdAt: iso(d.createdAt),
    };
  }
}

function requestNo(at: Date): string {
  const d = at.toISOString().slice(2, 10).replace(/-/g, '');
  return `PA-${d}-${randomBytes(2).toString('hex').toUpperCase()}`;
}
