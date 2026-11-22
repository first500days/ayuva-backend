import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { buildSafeRegex } from '../../common/utils/regex.util';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import {
  AdmissionDocument,
  AdmissionStatus,
  PartnerAdmission,
} from './schemas/admission.schema';
import { ErStatus, ErVisit, ErVisitDocument } from './schemas/er-visit.schema';
import {
  LisSample,
  LisSampleDocument,
  LisStatus,
} from './schemas/lis-sample.schema';
import {
  LisBarcodeDto,
  LisCancelDto,
  LisEntryDto,
  LisQueryDto,
  LisRejectDto,
  RequestLisDto,
} from './dto/lis.dto';
import {
  LisStage,
  TAT_TARGET,
  allowedKinds,
  canMove,
  overTarget,
} from './lis-rules';
import { dayKey, dayStart } from './clock';

const DAY = 24 * 60 * 60 * 1000;
const OPEN: LisStatus[] = [
  LisStatus.REQUESTED,
  LisStatus.COLLECTED,
  LisStatus.RECEIVED,
  LisStatus.PROCESSING,
  LisStatus.RESULTED,
];
const VIEWS: Record<string, LisStatus[]> = {
  requested: [LisStatus.REQUESTED],
  collected: [LisStatus.COLLECTED],
  in_lab: [LisStatus.RECEIVED, LisStatus.PROCESSING],
  resulted: [LisStatus.RESULTED],
  verified: [LisStatus.VERIFIED],
  rejected: [LisStatus.REJECTED],
  cancelled: [LisStatus.CANCELLED],
  open: OPEN,
};
const PRIORITY_RANK: Record<string, number> = {
  stat: 0,
  urgent: 1,
  routine: 2,
};
export const LIS_DEPARTMENT_LABEL: Record<string, string> = {
  haematology: 'Haematology',
  biochemistry: 'Biochemistry',
  microbiology: 'Microbiology',
  histopathology: 'Histopathology',
  cytology: 'Cytology',
  serology: 'Serology',
  clinical_pathology: 'Clinical pathology',
  blood_bank: 'Blood bank',
  other: 'Laboratory',
};

/**
 * Hospital Laboratory Information System: specimens from the ward or the
 * emergency department through the lab — request, collection (tube
 * label), reception (scan, with mismatch check), processing, text result
 * log, pathologist verification — plus rejection with automatic
 * re-collection and critical-result alerts to the requesting clinician.
 */
@Injectable()
export class PartnerLisService {
  constructor(
    @InjectModel(LisSample.name)
    private readonly sampleModel: Model<LisSampleDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    @InjectModel(ErVisit.name) private readonly erModel: Model<ErVisitDocument>,
    private readonly notifier: PartnerNotifierService,
    private readonly audit: AuditLogService,
  ) {}

  async list(actor: PartnerActor, q: LisQueryDto) {
    const view = q.view ?? 'open';
    const filter: QueryFilter<LisSampleDocument> = {
      providerId: actor.provider._id,
    };
    if (view !== 'all') filter.status = { $in: VIEWS[view] };
    const closed =
      view === 'all' || ['verified', 'rejected', 'cancelled'].includes(view);
    if (closed)
      filter.updatedAt = { $gte: new Date(Date.now() - (q.days ?? 7) * DAY) };
    if (q.department) filter.department = q.department;
    if (q.q?.trim()) {
      const rx = buildSafeRegex(q.q);
      filter.$or = [
        { accessionNo: rx },
        { barcode: rx },
        { patientName: rx },
        { tests: rx },
        { admissionNo: rx },
        { erNo: rx },
      ];
    }
    const rows = await this.sampleModel
      .find(filter)
      .sort({ createdAt: closed ? -1 : 1 })
      .limit(500)
      .exec();
    const now = new Date();
    const out = rows.map((s) => this.toResponse(s, now));
    if (!closed)
      out.sort(
        (a, b) =>
          Number(b.critical && b.status !== LisStatus.VERIFIED) -
            Number(a.critical && a.status !== LisStatus.VERIFIED) ||
          (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    const counts: Record<string, number> = {};
    for (const [k, statuses] of Object.entries(VIEWS)) {
      if (['verified', 'rejected', 'cancelled'].includes(k)) continue;
      counts[k] = await this.sampleModel.countDocuments({
        providerId: actor.provider._id,
        status: { $in: statuses },
      });
    }
    return { samples: out, counts };
  }

  async get(actor: PartnerActor, id: string) {
    return this.toResponse(await this.load(actor, id), new Date());
  }

  /** Find a sample by its tube label or accession number. */
  async scan(actor: PartnerActor, code: string) {
    const value = code.trim();
    const s = await this.sampleModel
      .findOne({
        providerId: actor.provider._id,
        $or: [{ barcode: value }, { accessionNo: value.toUpperCase() }],
      })
      .exec();
    if (!s) throw new NotFoundException(`No sample is labelled ${value}`);
    return this.toResponse(s, new Date());
  }

  async request(actor: PartnerActor, dto: RequestLisDto) {
    const patient = await this.patient(actor, dto);
    let sample: LisSampleDocument | null = null;
    for (let attempt = 0; attempt < 5 && !sample; attempt++) {
      try {
        sample = await this.sampleModel.create({
          providerId: actor.provider._id,
          accessionNo: await this.nextAccession(actor, attempt),
          ...patient,
          department: dto.department,
          specimen: dto.specimen,
          container: dto.container || undefined,
          tests: [...new Set(dto.tests.map((t) => t.trim()).filter(Boolean))],
          priority: dto.priority ?? 'routine',
          clinicalNotes: dto.clinicalNotes || undefined,
          requestedBy: {
            memberId: actor.member._id,
            name: actor.member.fullName,
          },
          timeline: [
            {
              at: new Date(),
              status: LisStatus.REQUESTED,
              byName: actor.member.fullName,
            },
          ],
        });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || attempt === 4)
          throw err;
      }
    }
    await this.record(actor, sample!, AuditAction.PARTNER_LIS_UPDATE, {
      change: 'requested',
      tests: sample!.tests.join(', '),
    });
    return this.toResponse(sample!, new Date());
  }

  async collect(actor: PartnerActor, id: string, dto: LisBarcodeDto) {
    const s = await this.load(actor, id);
    this.move(s, 'collected');
    if (dto.barcode) await this.label(actor, s, dto.barcode);
    s.collectedAt = new Date();
    s.collectedByName = actor.member.fullName;
    this.log(
      actor,
      s,
      LisStatus.COLLECTED,
      dto.barcode ? `Tube ${dto.barcode}` : undefined,
    );
    await s.save();
    await this.record(
      actor,
      s,
      dto.barcode
        ? AuditAction.PARTNER_LAB_SAMPLE_SCAN
        : AuditAction.PARTNER_LIS_UPDATE,
      {
        change: 'collected',
        ...(dto.barcode && { barcode: dto.barcode }),
      },
    );
    return this.toResponse(s, new Date());
  }

  /** Reception in the lab; a scanned tube must match the sample's label. */
  async receive(actor: PartnerActor, id: string, dto: LisBarcodeDto) {
    const s = await this.load(actor, id);
    if (dto.barcode && s.barcode && dto.barcode !== s.barcode) {
      await this.record(actor, s, AuditAction.PARTNER_LAB_SAMPLE_MISMATCH, {
        scanned: dto.barcode,
        expected: s.barcode,
      });
      throw new ConflictException(
        `Tube ${dto.barcode} doesn't match ${s.accessionNo} (labelled ${s.barcode}) — check the patient before going on`,
      );
    }
    this.move(s, 'received');
    if (dto.barcode && !s.barcode) await this.label(actor, s, dto.barcode);
    const now = new Date();
    if (!s.collectedAt) {
      s.collectedAt = now;
      s.collectedByName = actor.member.fullName;
    }
    s.receivedAt = now;
    s.receivedByName = actor.member.fullName;
    this.log(actor, s, LisStatus.RECEIVED);
    await s.save();
    await this.record(
      actor,
      s,
      dto.barcode
        ? AuditAction.PARTNER_LAB_SAMPLE_SCAN
        : AuditAction.PARTNER_LIS_UPDATE,
      {
        change: 'received',
        ...(dto.barcode && { barcode: dto.barcode }),
      },
    );
    return this.toResponse(s, now);
  }

  async process(actor: PartnerActor, id: string) {
    const s = await this.load(actor, id);
    this.move(s, 'processing');
    this.log(actor, s, LisStatus.PROCESSING);
    await s.save();
    await this.record(actor, s, AuditAction.PARTNER_LIS_UPDATE, {
      change: 'processing',
    });
    return this.toResponse(s, new Date());
  }

  async reject(actor: PartnerActor, id: string, dto: LisRejectDto) {
    const s = await this.load(actor, id);
    this.move(s, 'rejected');
    s.rejectReason = dto.reason;
    s.rejectNote = dto.note || undefined;
    this.log(
      actor,
      s,
      LisStatus.REJECTED,
      `${dto.reason.replace('_', ' ')}${dto.note ? ` — ${dto.note}` : ''}`,
    );
    let again: LisSampleDocument | null = null;
    if (dto.recollect !== false) {
      for (let attempt = 0; attempt < 5 && !again; attempt++) {
        try {
          again = await this.sampleModel.create({
            providerId: s.providerId,
            accessionNo: await this.nextAccession(actor, attempt),
            patientName: s.patientName,
            age: s.age,
            gender: s.gender,
            patientId: s.patientId,
            admissionId: s.admissionId,
            admissionNo: s.admissionNo,
            erVisitId: s.erVisitId,
            erNo: s.erNo,
            location: s.location,
            department: s.department,
            specimen: s.specimen,
            container: s.container,
            tests: s.tests,
            priority: s.priority,
            clinicalNotes: s.clinicalNotes,
            requestedBy: s.requestedBy,
            recollectionOf: s._id,
            recollectionOfNo: s.accessionNo,
            timeline: [
              {
                at: new Date(),
                status: LisStatus.REQUESTED,
                byName: actor.member.fullName,
                note: `Re-collection: ${s.accessionNo} rejected (${dto.reason.replace('_', ' ')})`,
              },
            ],
          });
        } catch (err) {
          if ((err as { code?: number }).code !== 11000 || attempt === 4)
            throw err;
        }
      }
      s.recollectionId = again!._id;
      s.recollectionNo = again!.accessionNo;
    }
    await s.save();
    await this.record(actor, s, AuditAction.PARTNER_LIS_UPDATE, {
      change: 'rejected',
      reason: dto.reason,
      ...(again && { recollection: again.accessionNo }),
    });
    return this.toResponse(s, new Date());
  }

  async cancel(actor: PartnerActor, id: string, dto: LisCancelDto) {
    const s = await this.load(actor, id);
    this.move(s, 'cancelled');
    this.log(actor, s, LisStatus.CANCELLED, dto.reason);
    await s.save();
    await this.record(actor, s, AuditAction.PARTNER_LIS_UPDATE, {
      change: 'cancelled',
    });
    return this.toResponse(s, new Date());
  }

  /** A text result entry; a final entry marks the sample resulted. */
  async addEntry(actor: PartnerActor, id: string, dto: LisEntryDto) {
    const s = await this.load(actor, id);
    const allowed = allowedKinds(s.status);
    if (!allowed.length)
      throw new BadRequestException(
        s.status === LisStatus.REQUESTED || s.status === LisStatus.COLLECTED
          ? 'Results are entered once the lab has received the sample'
          : `${s.accessionNo} is ${s.status}`,
      );
    if (!allowed.includes(dto.kind))
      throw new BadRequestException(
        s.status === LisStatus.VERIFIED
          ? 'The report is verified — add an addendum instead'
          : `A ${dto.kind} entry isn't possible now`,
      );
    const now = new Date();
    s.entries.push({
      at: now,
      kind: dto.kind,
      text: dto.text,
      critical: !!dto.critical,
      byName: actor.member.fullName,
      byMemberId: actor.member._id,
    } as never);
    if (dto.kind === 'final' && s.status !== LisStatus.RESULTED) {
      s.status = LisStatus.RESULTED;
      s.resultedAt = now;
      this.log(actor, s, LisStatus.RESULTED);
    }
    const newlyCritical = !!dto.critical;
    if (newlyCritical) s.critical = true;
    await s.save();
    await this.record(actor, s, AuditAction.PARTNER_LAB_RESULT_ENTRY, {
      change: `entry_${dto.kind}`,
      ...(dto.critical && { critical: true }),
    });
    if (newlyCritical) {
      const dept = LIS_DEPARTMENT_LABEL[s.department] ?? 'Laboratory';
      // Order no. only — never the patient or the value (alerts leave the portal).
      await this.notifier.emit(actor.provider._id, {
        trigger: PartnerTrigger.CRITICAL_LAB_RESULT,
        title: `Critical lab result — ${s.accessionNo}`,
        message: `${s.accessionNo} · ${dept}: a critical result was entered. Open the sample to review it.`,
        safeMessage:
          'A critical laboratory result needs review in the Ayuva portal.',
        route: '/partner/lis',
        data: { sampleId: s.id },
        ...(s.requestedBy.memberId && {
          memberIds: [s.requestedBy.memberId.toString()],
        }),
        excludeUserId: actor.userId,
      });
    }
    return this.toResponse(s, now);
  }

  async verify(actor: PartnerActor, id: string) {
    const s = await this.load(actor, id);
    if (!s.entries.some((e) => e.kind === 'final'))
      throw new BadRequestException('Add the final result before verifying');
    this.move(s, 'verified');
    s.verifiedAt = new Date();
    s.verifiedBy = { memberId: actor.member._id, name: actor.member.fullName };
    this.log(actor, s, LisStatus.VERIFIED);
    await s.save();
    await this.record(actor, s, AuditAction.PARTNER_LIS_UPDATE, {
      change: 'verified',
    });
    return this.toResponse(s, new Date());
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private move(s: LisSampleDocument, to: LisStage) {
    if (!canMove(s.status, to))
      throw new BadRequestException(
        `${s.accessionNo} is ${s.status} — it can't be marked ${to}`,
      );
    s.status = to as LisStatus;
  }

  private log(
    actor: PartnerActor,
    s: LisSampleDocument,
    status: LisStatus,
    note?: string,
  ) {
    s.timeline.push({
      at: new Date(),
      status,
      byName: actor.member.fullName,
      note,
    });
  }

  private async label(
    actor: PartnerActor,
    s: LisSampleDocument,
    barcode: string,
  ) {
    const other = await this.sampleModel
      .findOne(
        { providerId: actor.provider._id, barcode, _id: { $ne: s._id } },
        { accessionNo: 1 },
      )
      .exec();
    if (other)
      throw new ConflictException(
        `Tube ${barcode} is already on ${other.accessionNo}`,
      );
    s.barcode = barcode;
  }

  private async patient(actor: PartnerActor, dto: RequestLisDto) {
    if (dto.admissionId) {
      const a = await this.admissionModel
        .findOne({
          _id: this.oid(dto.admissionId),
          providerId: actor.provider._id,
        })
        .exec();
      if (!a) throw new BadRequestException('That admission was not found');
      if (a.status !== AdmissionStatus.ADMITTED)
        throw new BadRequestException(`${a.patientName} has been discharged`);
      return {
        patientName: a.patientName,
        age: a.age,
        gender: a.gender,
        patientId: a.patientId,
        admissionId: a._id,
        admissionNo: a.admissionNo,
        location: dto.location || `${a.wardName} · ${a.bedLabel}`,
      };
    }
    if (dto.erVisitId) {
      const v = await this.erModel
        .findOne({
          _id: this.oid(dto.erVisitId),
          providerId: actor.provider._id,
        })
        .exec();
      if (!v)
        throw new BadRequestException('That emergency visit was not found');
      if (v.status === ErStatus.CLOSED)
        throw new BadRequestException(`${v.erNo} is already closed`);
      return {
        patientName: v.patientName,
        age: v.age,
        gender: v.gender && v.gender !== 'unknown' ? v.gender : undefined,
        erVisitId: v._id,
        erNo: v.erNo,
        location: dto.location || `Emergency${v.area ? ` · ${v.area}` : ''}`,
      };
    }
    if (!dto.patientName)
      throw new BadRequestException(
        'Choose the inpatient or emergency patient, or enter a name',
      );
    return {
      patientName: dto.patientName,
      age: dto.age,
      gender: dto.gender,
      location: dto.location || 'OPD',
    };
  }

  private async nextAccession(actor: PartnerActor, bump: number) {
    const now = new Date();
    const start = dayStart(now);
    const count = await this.sampleModel.countDocuments({
      providerId: actor.provider._id,
      createdAt: { $gte: start, $lt: new Date(start.getTime() + DAY) },
    });
    return `LAB-${dayKey(now)}-${String(count + 1 + bump).padStart(4, '0')}`;
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
    return new Types.ObjectId(id);
  }

  private async load(actor: PartnerActor, id: string) {
    const s = await this.sampleModel
      .findOne({ _id: this.oid(id), providerId: actor.provider._id })
      .exec();
    if (!s) throw new NotFoundException('Sample not found');
    return s;
  }

  private toResponse(s: LisSampleDocument, now: Date) {
    const iso = (d?: Date) => d?.toISOString() ?? null;
    const inLab =
      s.status === LisStatus.RECEIVED ||
      s.status === LisStatus.PROCESSING ||
      s.status === LisStatus.RESULTED;
    const over = inLab ? overTarget(s.priority, s.receivedAt, now) : null;
    return {
      id: s.id,
      accessionNo: s.accessionNo,
      barcode: s.barcode ?? null,
      patientName: s.patientName,
      age: s.age ?? null,
      gender: s.gender ?? null,
      admissionNo: s.admissionNo ?? null,
      erNo: s.erNo ?? null,
      location: s.location ?? null,
      department: s.department,
      specimen: s.specimen,
      container: s.container ?? null,
      tests: s.tests,
      priority: s.priority,
      clinicalNotes: s.clinicalNotes ?? null,
      requestedBy: {
        id: s.requestedBy.memberId?.toString() ?? null,
        name: s.requestedBy.name,
      },
      status: s.status,
      collectedAt: iso(s.collectedAt),
      collectedByName: s.collectedByName ?? null,
      receivedAt: iso(s.receivedAt),
      receivedByName: s.receivedByName ?? null,
      resultedAt: iso(s.resultedAt),
      verifiedAt: iso(s.verifiedAt),
      verifiedBy: s.verifiedBy
        ? {
            id: s.verifiedBy.memberId?.toString() ?? null,
            name: s.verifiedBy.name,
          }
        : null,
      rejectReason: s.rejectReason ?? null,
      rejectNote: s.rejectNote ?? null,
      recollectionNo: s.recollectionNo ?? null,
      recollectionOfNo: s.recollectionOfNo ?? null,
      critical: s.critical,
      targetMinutes: TAT_TARGET[s.priority] ?? TAT_TARGET.routine,
      overTargetMinutes: over,
      overdue: over !== null && over > 0,
      turnaroundMinutes:
        s.receivedAt && s.verifiedAt
          ? Math.round(
              (s.verifiedAt.getTime() - s.receivedAt.getTime()) / 60000,
            )
          : null,
      entries: s.entries.map((e) => ({
        id: e._id.toString(),
        at: e.at.toISOString(),
        kind: e.kind,
        text: e.text,
        critical: e.critical,
        byName: e.byName ?? null,
      })),
      timeline: s.timeline.map((t) => ({
        at: t.at.toISOString(),
        status: t.status,
        byName: t.byName ?? null,
        note: t.note ?? null,
      })),
      createdAt: iso(s.createdAt) ?? new Date().toISOString(),
    };
  }

  private record(
    actor: PartnerActor,
    s: LisSampleDocument,
    action: AuditAction,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action,
      targetType: 'LisSample',
      targetId: s.id,
      metadata: {
        providerId: actor.provider.id,
        ...(s.patientId && { patientId: s.patientId.toString() }),
        label: s.accessionNo,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }
}
