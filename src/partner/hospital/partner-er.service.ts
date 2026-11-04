import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { Perm, StaffRole } from '../rbac/partner-permissions';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import {
  AdmissionDocument,
  PartnerAdmission,
} from './schemas/admission.schema';
import { ErStatus, ErVisit, ErVisitDocument } from './schemas/er-visit.schema';
import {
  AssignErDto,
  DisposeErDto,
  ErBoardQueryDto,
  RegisterErDto,
  TriageDto,
  UpdateErPatientDto,
} from './dto/er.dto';
import { dayKey, dayStart } from './clock';
import {
  TRIAGE_LEVELS,
  TriageLevel,
  median,
  minutesOverTarget,
  suggestLevel,
} from './triage';

const HOUR = 60 * 60 * 1000;
const minutesBetween = (a: Date, b: Date) =>
  Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

/**
 * Emergency & ER Triage: a casualty workflow separate from booked
 * appointments — fast registration (unidentified patients allowed),
 * five-level triage with rule-based suggestions from vital signs, doctor
 * pick-up against target times, and disposition (admit, discharge, refer,
 * LAMA…). Level 1–2 arrivals alert the on-duty clinical team.
 */
@Injectable()
export class PartnerErService {
  constructor(
    @InjectModel(ErVisit.name)
    private readonly visitModel: Model<ErVisitDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    private readonly notifier: PartnerNotifierService,
    private readonly audit: AuditLogService,
  ) {}

  async board(actor: PartnerActor, q: ErBoardQueryDto) {
    const now = new Date();
    const since = new Date(now.getTime() - (q.closedHours ?? 24) * HOUR);
    const [active, closed, day] = await Promise.all([
      this.visitModel
        .find({
          providerId: actor.provider._id,
          status: { $ne: ErStatus.CLOSED },
        })
        .sort({ arrivedAt: 1 })
        .limit(500)
        .exec(),
      this.visitModel
        .find({
          providerId: actor.provider._id,
          status: ErStatus.CLOSED,
          'disposition.at': { $gte: since },
        })
        .sort({ 'disposition.at': -1 })
        .limit(100)
        .exec(),
      this.visitModel
        .find({
          providerId: actor.provider._id,
          arrivedAt: { $gte: new Date(now.getTime() - 24 * HOUR) },
        })
        .limit(5000)
        .exec(),
    ]);
    const rows = active.map((v) => this.toResponse(v, now));
    // Untriaged first (acuity unknown), then most urgent, then longest waiting.
    rows.sort(
      (a, b) =>
        (a.level ?? 0) - (b.level ?? 0) ||
        new Date(a.arrivedAt).getTime() - new Date(b.arrivedAt).getTime(),
    );
    const byLevel: Record<string, number> = {
      untriaged: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const r of rows) byLevel[r.level ?? 'untriaged']++;
    const toTriage = day
      .filter((v) => v.triage.length)
      .map((v) => minutesBetween(v.arrivedAt, v.triage[0].at));
    const toDoctor = day
      .filter((v) => v.seenAt)
      .map((v) => minutesBetween(v.arrivedAt, v.seenAt!));
    const ended = (types: string[]) =>
      day.filter((v) => v.disposition && types.includes(v.disposition.type))
        .length;
    return {
      active: rows,
      closed: closed.map((v) => this.toResponse(v, now)),
      stats: {
        arrivals24h: day.length,
        waiting: rows.length,
        byLevel,
        breaches: rows.filter((r) => r.breached).length,
        medianDoorToTriage: median(toTriage),
        medianDoorToDoctor: median(toDoctor),
        admitted24h: ended(['admitted']),
        leftWithoutCare24h: ended(['lama', 'absconded']),
      },
    };
  }

  async get(actor: PartnerActor, id: string) {
    return this.toResponse(await this.load(actor, id), new Date());
  }

  async register(actor: PartnerActor, dto: RegisterErDto) {
    const name = dto.patientName?.trim();
    if (!name && !dto.unidentified)
      throw new BadRequestException(
        "Enter the patient's name, or mark them unidentified",
      );
    if (dto.triage && !actor.permissions.includes(Perm.ER_TRIAGE))
      throw new ForbiddenException(
        'Your role can register patients; a nurse or doctor triages them',
      );
    const arrivedAt = dto.arrivedAt ? new Date(dto.arrivedAt) : new Date();
    if (arrivedAt.getTime() > Date.now() + 5 * 60 * 1000)
      throw new BadRequestException("Arrival time can't be in the future");
    const unknownName = `Unknown ${dto.gender && dto.gender !== 'unknown' ? dto.gender : 'patient'}${
      dto.age !== undefined ? `, ~${dto.age}` : ''
    }`;
    let visit: ErVisitDocument | null = null;
    for (let attempt = 0; attempt < 5 && !visit; attempt++) {
      try {
        visit = new this.visitModel({
          providerId: actor.provider._id,
          erNo: await this.nextErNo(actor, arrivedAt, attempt),
          arrivedAt,
          arrivalMode: dto.arrivalMode ?? 'walk_in',
          patientName: name || unknownName,
          unidentified: !name,
          age: dto.age,
          ageApprox: !!dto.ageApprox,
          gender: dto.gender,
          phone: dto.phone || undefined,
          broughtBy: dto.broughtBy || undefined,
          complaint: dto.complaint,
          mlc: this.mlc(dto.mlc),
          registeredByName: actor.member.fullName,
        });
        if (dto.triage) this.applyTriage(actor, visit, dto.triage);
        await visit.save();
      } catch (err) {
        visit = null;
        if ((err as { code?: number }).code !== 11000 || attempt === 4)
          throw err;
      }
    }
    await this.record(actor, visit!, {
      change: 'registered',
      ...(dto.triage && { level: dto.triage.level }),
    });
    await this.maybeAlert(actor, visit!);
    return this.toResponse(visit!, new Date());
  }

  async triage(actor: PartnerActor, id: string, dto: TriageDto) {
    const visit = await this.load(actor, id);
    this.assertOpen(visit);
    const previous = visit.triage.at(-1)?.level;
    this.applyTriage(actor, visit, dto);
    await visit.save();
    await this.record(actor, visit, {
      change: previous ? 're_triaged' : 'triaged',
      level: dto.level,
      ...(previous && { previousLevel: previous }),
    });
    await this.maybeAlert(actor, visit);
    return this.toResponse(visit, new Date());
  }

  async assign(actor: PartnerActor, id: string, dto: AssignErDto) {
    const visit = await this.load(actor, id);
    this.assertOpen(visit);
    let doctor: PartnerMemberDocument | null = null;
    if (dto.doctorMemberId) {
      doctor = await this.memberModel
        .findOne({
          _id: dto.doctorMemberId,
          providerId: actor.provider._id,
          status: MemberStatus.ACTIVE,
          role: StaffRole.DOCTOR,
        })
        .exec();
      if (!doctor)
        throw new BadRequestException(
          'Choose an active doctor of this hospital',
        );
    } else if (actor.role === StaffRole.DOCTOR) {
      doctor = actor.member;
    } else {
      throw new BadRequestException('Choose the doctor taking this patient');
    }
    visit.doctorMemberId = doctor._id;
    visit.doctorName = doctor.fullName;
    visit.seenAt = visit.seenAt ?? new Date();
    if (dto.area !== undefined) visit.area = dto.area || undefined;
    visit.status = ErStatus.IN_TREATMENT;
    await visit.save();
    await this.record(actor, visit, {
      change: 'doctor_assigned',
      doctor: doctor.fullName,
    });
    return this.toResponse(visit, new Date());
  }

  async updatePatient(
    actor: PartnerActor,
    id: string,
    dto: UpdateErPatientDto,
  ) {
    const visit = await this.load(actor, id);
    const changed: string[] = [];
    for (const [k, v] of Object.entries(dto) as [string, unknown][]) {
      if (v === undefined || k === 'mlc') continue;
      visit.set(k, v === '' ? undefined : v);
      changed.push(k);
    }
    if (dto.mlc) {
      visit.mlc = this.mlc(dto.mlc);
      changed.push('mlc');
    }
    const identified = !!dto.patientName && visit.unidentified;
    if (identified) visit.unidentified = false;
    await visit.save();
    if (changed.length)
      await this.record(actor, visit, {
        change: identified ? 'identified' : 'details_updated',
        fields: changed,
      });
    return this.toResponse(visit, new Date());
  }

  async dispose(actor: PartnerActor, id: string, dto: DisposeErDto) {
    const visit = await this.load(actor, id);
    this.assertOpen(visit);
    if (dto.type === 'referred' && !dto.referredTo?.trim())
      throw new BadRequestException('Where was the patient referred to?');
    let admissionNo: string | undefined;
    if (dto.admissionId) {
      if (dto.type !== 'admitted')
        throw new BadRequestException('An admission only goes with "Admitted"');
      const adm = await this.admissionModel
        .findOne({ _id: dto.admissionId, providerId: actor.provider._id })
        .exec();
      if (!adm) throw new BadRequestException('That admission was not found');
      admissionNo = adm.admissionNo;
    }
    visit.disposition = {
      type: dto.type,
      at: new Date(),
      note: dto.note || undefined,
      referredTo: dto.referredTo || undefined,
      admissionId: dto.admissionId
        ? new Types.ObjectId(dto.admissionId)
        : undefined,
      admissionNo,
      byName: actor.member.fullName,
    };
    visit.status = ErStatus.CLOSED;
    await visit.save();
    await this.record(actor, visit, {
      change: `disposition_${dto.type}`,
      ...(admissionNo && { admissionNo }),
    });
    return this.toResponse(visit, new Date());
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private applyTriage(
    actor: PartnerActor,
    visit: ErVisitDocument,
    dto: TriageDto,
  ) {
    const vitals = Object.fromEntries(
      Object.entries(dto.vitals ?? {}).filter(
        ([, v]) => typeof v === 'number' && Number.isFinite(v),
      ),
    );
    const s = suggestLevel(vitals, { unresponsive: dto.unresponsive });
    if (s.level && dto.level > s.level && !dto.overrideReason?.trim())
      throw new BadRequestException(
        `The vital signs suggest Level ${s.level} — ${TRIAGE_LEVELS[s.level].label} (${s.reasons.join(', ')}). Give a reason to triage as Level ${dto.level}.`,
      );
    visit.triage.push({
      at: new Date(),
      level: dto.level,
      vitals,
      suggestedLevel: s.level ?? undefined,
      reasons: dto.unresponsive
        ? ['Unresponsive', ...s.reasons.filter((r) => r !== 'Unresponsive')]
        : s.reasons,
      overrideReason: dto.overrideReason || undefined,
      notes: dto.notes || undefined,
      byMemberId: actor.member._id,
      byName: actor.member.fullName,
    });
    if (visit.status === ErStatus.WAITING) visit.status = ErStatus.TRIAGED;
  }

  /** Level 1–2: tell the clinical team at once (portal text may carry the complaint; email/SMS never do). */
  private async maybeAlert(actor: PartnerActor, visit: ErVisitDocument) {
    const level = visit.triage.at(-1)?.level as TriageLevel | undefined;
    if (!level || level > 2) return;
    if (visit.alertedLevel && visit.alertedLevel <= level) return;
    const { label } = TRIAGE_LEVELS[level];
    await this.notifier.emit(actor.provider._id, {
      trigger: PartnerTrigger.ER_CRITICAL_ARRIVAL,
      title: `Emergency: Level ${level} — ${label}`,
      message: `${visit.erNo} · ${visit.complaint}${visit.area ? ` · ${visit.area}` : ''}`,
      safeMessage: `A Level ${level} (${label}) patient needs a doctor in the Emergency department.`,
      route: '/partner/er',
      data: { visitId: visit.id, level },
      excludeUserId: actor.userId,
    });
    visit.alertedLevel = level;
    await visit.save();
  }

  private mlc(m: RegisterErDto['mlc']) {
    if (!m?.isMlc) return { isMlc: false };
    return {
      isMlc: true,
      mlcNo: m.mlcNo || undefined,
      policeStation: m.policeStation || undefined,
      informedAt: m.informedAt ? new Date(m.informedAt) : undefined,
    };
  }

  private async nextErNo(actor: PartnerActor, at: Date, bump: number) {
    const start = dayStart(at);
    const end = new Date(start.getTime() + 24 * HOUR);
    const count = await this.visitModel.countDocuments({
      providerId: actor.provider._id,
      arrivedAt: { $gte: start, $lt: end },
    });
    return `ER-${dayKey(at)}-${String(count + 1 + bump).padStart(3, '0')}`;
  }

  private assertOpen(visit: ErVisitDocument) {
    if (visit.status === ErStatus.CLOSED)
      throw new BadRequestException(
        `${visit.erNo} is already closed (${visit.disposition?.type ?? 'closed'})`,
      );
  }

  private async load(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Emergency visit not found');
    const visit = await this.visitModel
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!visit) throw new NotFoundException('Emergency visit not found');
    return visit;
  }

  private toResponse(v: ErVisitDocument, now: Date) {
    const latest = v.triage.at(-1);
    const level = (latest?.level as TriageLevel | undefined) ?? null;
    const open = v.status !== ErStatus.CLOSED;
    const over =
      level && latest && !v.seenAt && open
        ? minutesOverTarget(level, latest.at, now)
        : null;
    const iso = (d?: Date) => d?.toISOString() ?? null;
    return {
      id: v.id,
      erNo: v.erNo,
      arrivedAt: v.arrivedAt.toISOString(),
      arrivalMode: v.arrivalMode,
      patientName: v.patientName,
      unidentified: v.unidentified,
      age: v.age ?? null,
      ageApprox: v.ageApprox,
      gender: v.gender ?? null,
      phone: v.phone ?? null,
      broughtBy: v.broughtBy ?? null,
      complaint: v.complaint,
      mlc: {
        isMlc: v.mlc?.isMlc ?? false,
        mlcNo: v.mlc?.mlcNo ?? null,
        policeStation: v.mlc?.policeStation ?? null,
        informedAt: iso(v.mlc?.informedAt),
      },
      status: v.status,
      level,
      levelLabel: level ? TRIAGE_LEVELS[level].label : null,
      targetMinutes: level ? TRIAGE_LEVELS[level].targetMinutes : null,
      waitingMinutes: open ? minutesBetween(v.arrivedAt, now) : null,
      overTargetMinutes: over,
      breached: over !== null && over > 0,
      doorToTriage: v.triage[0]
        ? minutesBetween(v.arrivedAt, v.triage[0].at)
        : null,
      doorToDoctor: v.seenAt ? minutesBetween(v.arrivedAt, v.seenAt) : null,
      area: v.area ?? null,
      doctor: v.doctorMemberId
        ? { id: v.doctorMemberId.toString(), name: v.doctorName ?? '' }
        : null,
      seenAt: iso(v.seenAt),
      vitals: latest?.vitals ?? null,
      triage: v.triage.map((t) => ({
        at: t.at.toISOString(),
        level: t.level,
        vitals: t.vitals ?? null,
        suggestedLevel: t.suggestedLevel ?? null,
        reasons: t.reasons,
        overrideReason: t.overrideReason ?? null,
        notes: t.notes ?? null,
        byName: t.byName ?? null,
      })),
      disposition: v.disposition
        ? {
            type: v.disposition.type,
            at: v.disposition.at.toISOString(),
            note: v.disposition.note ?? null,
            referredTo: v.disposition.referredTo ?? null,
            admissionId: v.disposition.admissionId?.toString() ?? null,
            admissionNo: v.disposition.admissionNo ?? null,
            byName: v.disposition.byName ?? null,
          }
        : null,
      registeredByName: v.registeredByName ?? null,
    };
  }

  private record(
    actor: PartnerActor,
    visit: ErVisitDocument,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_ER_UPDATE,
      targetType: 'ErVisit',
      targetId: visit.id,
      metadata: {
        providerId: actor.provider.id,
        label: visit.erNo,
        ...metadata,
      },
      ipAddress: actor.ip,
    });
  }
}
