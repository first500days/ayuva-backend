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
import { PartnerActor } from '../rbac/partner-perm.guard';
import { StaffRole } from '../rbac/partner-permissions';
import {
  MemberStatus,
  PartnerMember,
  PartnerMemberDocument,
} from '../staff/schemas/partner-member.schema';
import {
  AdmissionDocument,
  PartnerAdmission,
} from './schemas/admission.schema';
import {
  OtCase,
  OtCaseDocument,
  OtRoom,
  OtRoomDocument,
  OtStatus,
} from './schemas/ot.schema';
import {
  BookOtCaseDto,
  CreateOtRoomDto,
  OtAvailabilityQueryDto,
  OtCasesQueryDto,
  OtChecklistDto,
  OtPostOpDto,
  OtStageDto,
  OtTimeDto,
  UpdateOtCaseDto,
  UpdateOtRoomDto,
} from './dto/ot.dto';
import {
  Stage,
  isLocalOnly,
  minutes,
  missingFor,
  onRoster,
  overlaps,
  rosterFor,
  timeGate,
} from './ot-rules';
import { dateStart, dayKey, dayStart, wallClock } from './clock';

const MIN = 60 * 1000;
/** Cases that still hold their room and team. */
const LIVE: OtStatus[] = [
  OtStatus.SCHEDULED,
  OtStatus.PRE_OP,
  OtStatus.IN_THEATRE,
  OtStatus.RECOVERY,
  OtStatus.COMPLETED,
];
const EDITABLE: OtStatus[] = [
  OtStatus.SCHEDULED,
  OtStatus.PRE_OP,
  OtStatus.POSTPONED,
];
/** Cases that block their theatre and team: once the patient leaves theatre the slot is free. */
const BLOCKING: OtStatus[] = [
  OtStatus.SCHEDULED,
  OtStatus.PRE_OP,
  OtStatus.IN_THEATRE,
];
const PRE_OP_ITEMS = [
  'consent',
  'siteMarked',
  'fasting',
  'anaesthesiaCheck',
  'bloodArranged',
  'investigations',
  'implantsReady',
  'antibiotic',
] as const;

const hhmm = (d: Date) => {
  const m = wallClock(d).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Operation Theatre Scheduler: theatres, case bookings with room / surgeon
 * / anaesthetist clash checks against the duty roster, and the case's
 * journey — pre-op readiness, WHO Surgical Safety Checklist (Sign In,
 * Time Out, Sign Out), intra-op times, recovery and the operation note.
 */
@Injectable()
export class PartnerOtService {
  constructor(
    @InjectModel(OtRoom.name) private readonly roomModel: Model<OtRoomDocument>,
    @InjectModel(OtCase.name) private readonly caseModel: Model<OtCaseDocument>,
    @InjectModel(PartnerMember.name)
    private readonly memberModel: Model<PartnerMemberDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    private readonly audit: AuditLogService,
  ) {}

  // ── Theatres ──────────────────────────────────────────────────────────────

  async rooms(actor: PartnerActor) {
    const rooms = await this.roomModel
      .find({ providerId: actor.provider._id })
      .sort({ name: 1 })
      .exec();
    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      active: r.active,
    }));
  }

  async createRoom(actor: PartnerActor, dto: CreateOtRoomDto) {
    if (
      await this.roomModel.exists({
        providerId: actor.provider._id,
        name: dto.name,
      })
    )
      throw new ConflictException(`${dto.name} already exists`);
    const room = await this.roomModel.create({
      providerId: actor.provider._id,
      name: dto.name,
      type: dto.type ?? 'general',
    });
    await this.record(actor, 'OtRoom', room.id, room.name, {
      change: 'theatre_added',
    });
    return {
      id: room.id,
      name: room.name,
      type: room.type,
      active: room.active,
    };
  }

  async updateRoom(actor: PartnerActor, id: string, dto: UpdateOtRoomDto) {
    const room = await this.roomModel
      .findOne({ _id: this.oid(id), providerId: actor.provider._id })
      .exec();
    if (!room) throw new NotFoundException('Theatre not found');
    if (dto.name && dto.name !== room.name) {
      if (
        await this.roomModel.exists({
          providerId: actor.provider._id,
          name: dto.name,
        })
      )
        throw new ConflictException(`${dto.name} already exists`);
      room.name = dto.name;
    }
    if (dto.type) room.type = dto.type;
    if (dto.active !== undefined) room.active = dto.active;
    await room.save();
    await this.record(actor, 'OtRoom', room.id, room.name, {
      change: 'theatre_updated',
    });
    return {
      id: room.id,
      name: room.name,
      type: room.type,
      active: room.active,
    };
  }

  // ── Schedule ──────────────────────────────────────────────────────────────

  async list(actor: PartnerActor, q: OtCasesQueryDto) {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (!(to > from) || to.getTime() - from.getTime() > 62 * 24 * 60 * MIN)
      throw new BadRequestException('Choose a range of up to two months');
    const cases = await this.caseModel
      .find({
        providerId: actor.provider._id,
        start: { $lt: to },
        end: { $gt: from },
      })
      .sort({ start: 1 })
      .limit(2000)
      .exec();
    return {
      rooms: await this.rooms(actor),
      cases: cases.map((c) => this.toResponse(c)),
    };
  }

  async get(actor: PartnerActor, id: string) {
    return this.toResponse(await this.load(actor, id));
  }

  /** Doctors with their duty roster and theatre bookings on a date. */
  async availability(actor: PartnerActor, q: OtAvailabilityQueryDto) {
    const start = dateStart(q.date);
    const end = new Date(start.getTime() + 24 * 60 * MIN);
    const [doctors, cases] = await Promise.all([
      this.memberModel
        .find({
          providerId: actor.provider._id,
          role: StaffRole.DOCTOR,
          status: MemberStatus.ACTIVE,
        })
        .sort({ fullName: 1 })
        .exec(),
      this.caseModel
        .find({
          providerId: actor.provider._id,
          status: { $in: LIVE },
          start: { $lt: end },
          end: { $gt: start },
        })
        .exec(),
    ]);
    return doctors.map((d) => ({
      id: d.id,
      name: d.fullName,
      title: d.title ?? null,
      department: d.department ?? null,
      onDuty: d.onDuty,
      hasRoster: (d.dutySchedule ?? []).length > 0,
      roster: rosterFor(
        d.dutySchedule ?? [],
        new Date(start.getTime() + 12 * 60 * MIN),
      ),
      cases: cases
        .filter(
          (c) =>
            c.surgeon.memberId?.equals(d._id) ||
            c.anaesthetist?.memberId?.equals(d._id),
        )
        .map((c) => ({
          id: c.id,
          caseNo: c.caseNo,
          start: c.start.toISOString(),
          end: c.end.toISOString(),
          roomName: c.roomName,
          role: c.surgeon.memberId?.equals(d._id) ? 'surgeon' : 'anaesthetist',
          procedure: c.procedure,
        })),
    }));
  }

  async book(actor: PartnerActor, dto: BookOtCaseDto) {
    const start = new Date(dto.start);
    if (start.getTime() < Date.now() - 60 * MIN)
      throw new BadRequestException("A case can't be booked in the past");
    const end = new Date(start.getTime() + dto.durationMinutes * MIN);
    const room = await this.activeRoom(actor, dto.roomId);
    const anaesthesia = dto.anaesthesia ?? 'general';
    const { surgeon, anaesthetist } = await this.team(
      actor,
      dto.surgeonMemberId,
      dto.anaesthetistMemberId,
      anaesthesia,
    );
    await this.checkClashes(
      actor,
      { start, end },
      room._id,
      surgeon,
      anaesthetist,
      null,
      !!dto.allowOffRoster,
    );
    const patient = await this.patient(actor, dto);

    let created: OtCaseDocument | null = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      try {
        created = await this.caseModel.create({
          providerId: actor.provider._id,
          caseNo: await this.nextCaseNo(actor, start, attempt),
          roomId: room._id,
          roomName: room.name,
          start,
          end,
          ...patient,
          procedure: dto.procedure,
          side: dto.side ?? 'na',
          priority: dto.priority ?? 'elective',
          department: dto.department || surgeon.department || undefined,
          surgeon: { memberId: surgeon._id, name: surgeon.fullName },
          anaesthetist: anaesthetist
            ? { memberId: anaesthetist._id, name: anaesthetist.fullName }
            : undefined,
          anaesthesia,
          assistants: (dto.assistants ?? [])
            .filter(Boolean)
            .map((name) => ({ name })),
          notes: dto.notes || undefined,
          stageLog: [
            {
              at: new Date(),
              from: 'new',
              to: OtStatus.SCHEDULED,
              byName: actor.member.fullName,
            },
          ],
          bookedByName: actor.member.fullName,
        });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000 || attempt === 4)
          throw err;
      }
    }
    await this.record(actor, 'OtCase', created!.id, created!.caseNo, {
      change: 'booked',
      room: room.name,
      start: start.toISOString(),
    });
    return this.toResponse(created!);
  }

  async update(actor: PartnerActor, id: string, dto: UpdateOtCaseDto) {
    const c = await this.load(actor, id);
    if (!EDITABLE.includes(c.status))
      throw new BadRequestException(
        `${c.caseNo} is ${c.status.replace('_', '-')} — it can no longer be rescheduled`,
      );
    const start = dto.start ? new Date(dto.start) : c.start;
    const duration =
      dto.durationMinutes ??
      Math.round((c.end.getTime() - c.start.getTime()) / MIN);
    const end = new Date(start.getTime() + duration * MIN);
    const moved = !!dto.start || !!dto.durationMinutes || !!dto.roomId;
    if (dto.start && start.getTime() < Date.now() - 60 * MIN)
      throw new BadRequestException("A case can't be moved into the past");
    const room = dto.roomId
      ? await this.activeRoom(actor, dto.roomId)
      : await this.roomModel.findById(c.roomId).exec();
    const anaesthesia = dto.anaesthesia ?? c.anaesthesia;
    const { surgeon, anaesthetist } = await this.team(
      actor,
      dto.surgeonMemberId ?? c.surgeon.memberId?.toString() ?? '',
      dto.anaesthetistMemberId ?? c.anaesthetist?.memberId?.toString(),
      anaesthesia,
    );
    await this.checkClashes(
      actor,
      { start, end },
      room!._id,
      surgeon,
      anaesthetist,
      c._id,
      !!dto.allowOffRoster,
    );
    if (
      dto.patientName ||
      dto.admissionId ||
      dto.age !== undefined ||
      dto.gender
    )
      Object.assign(
        c,
        await this.patient(actor, {
          ...dto,
          patientName: dto.patientName ?? c.patientName,
        }),
      );
    c.start = start;
    c.end = end;
    c.roomId = room!._id;
    c.roomName = room!.name;
    c.surgeon = { memberId: surgeon._id, name: surgeon.fullName };
    c.anaesthetist = anaesthetist
      ? { memberId: anaesthetist._id, name: anaesthetist.fullName }
      : undefined;
    c.anaesthesia = anaesthesia;
    for (const k of [
      'procedure',
      'side',
      'priority',
      'department',
      'notes',
    ] as const)
      if (dto[k] !== undefined) c.set(k, dto[k] || undefined);
    if (dto.assistants)
      c.assistants = dto.assistants.filter(Boolean).map((name) => ({ name }));
    if (c.status === OtStatus.POSTPONED) {
      c.stageLog.push({
        at: new Date(),
        from: c.status,
        to: OtStatus.SCHEDULED,
        byName: actor.member.fullName,
        note: 'Rescheduled',
      });
      c.status = OtStatus.SCHEDULED;
      c.cancelReason = undefined;
    }
    await c.save();
    await this.record(actor, 'OtCase', c.id, c.caseNo, {
      change: moved ? 'rescheduled' : 'details_updated',
      ...(moved && { room: c.roomName, start: c.start.toISOString() }),
    });
    return this.toResponse(c);
  }

  // ── The case's journey ────────────────────────────────────────────────────

  async stage(actor: PartnerActor, id: string, dto: OtStageDto) {
    const c = await this.load(actor, id);
    const from = c.status as Stage;
    const to = dto.to;
    const missing = missingFor(from, to, {
      side: c.side,
      anaesthesia: c.anaesthesia,
      preOp: (c.preOp ?? {}) as Record<string, unknown>,
      safety: c.safety ?? {},
      postOp: c.postOp ?? null,
    });
    if (missing.length)
      throw new BadRequestException(
        missing.length === 1 && /can't go/.test(missing[0])
          ? missing[0]
          : `Not yet: ${missing.join('; ')}`,
      );
    if ((to === 'cancelled' || to === 'postponed') && !dto.note?.trim())
      throw new BadRequestException(
        `Give a reason to ${to === 'cancelled' ? 'cancel' : 'postpone'} the case`,
      );
    const now = new Date();
    const times = c.times ?? {};
    if (to === 'in_theatre') times.wheeledIn = times.wheeledIn ?? now;
    if (to === 'recovery') {
      times.wheeledOut = times.wheeledOut ?? now;
      times.recoveryIn = times.recoveryIn ?? now;
    }
    if (to === 'completed') {
      if (from === 'recovery') times.recoveryOut = times.recoveryOut ?? now;
      else times.wheeledOut = times.wheeledOut ?? now;
    }
    c.times = times;
    c.markModified('times');
    if (to === 'cancelled' || to === 'postponed') c.cancelReason = dto.note;
    c.status = to as OtStatus;
    c.stageLog.push({
      at: now,
      from,
      to,
      byName: actor.member.fullName,
      note: dto.note || undefined,
    });
    await c.save();
    await this.record(actor, 'OtCase', c.id, c.caseNo, {
      change: `stage_${to}`,
      from,
    });
    return this.toResponse(c);
  }

  async checklist(actor: PartnerActor, id: string, dto: OtChecklistDto) {
    const c = await this.load(actor, id);
    const tick = { at: new Date(), byName: actor.member.fullName };
    const changed: string[] = [];
    if (dto.preOp) {
      if (![OtStatus.SCHEDULED, OtStatus.PRE_OP].includes(c.status))
        throw new BadRequestException(
          'The pre-op checklist is closed once the patient is in theatre',
        );
      const preOp = (c.preOp ?? {}) as Record<string, unknown>;
      for (const k of PRE_OP_ITEMS) {
        const v = dto.preOp[k];
        if (v === undefined) continue;
        if (v && !preOp[k]) preOp[k] = tick;
        if (!v) preOp[k] = undefined;
        changed.push(`${v ? '' : 'un'}${k}`);
      }
      c.preOp = preOp;
      c.markModified('preOp');
    }
    const safety = c.safety ?? {};
    const sign = (
      key: 'signIn' | 'timeOut' | 'signOut',
      needs: 'signIn' | 'timeOut' | null,
      label: string,
    ) => {
      if (!dto[key]) return;
      if (
        c.status !== OtStatus.IN_THEATRE &&
        !(key === 'signIn' && c.status === OtStatus.PRE_OP)
      )
        throw new BadRequestException(`${label} is done in theatre`);
      if (needs && !safety[needs])
        throw new BadRequestException(
          `${label} comes after the ${needs === 'signIn' ? 'Sign In' : 'Time Out'}`,
        );
      if (!safety[key]) {
        safety[key] = tick;
        changed.push(key);
      }
    };
    sign('signIn', null, 'Sign In');
    sign('timeOut', 'signIn', 'Time Out');
    sign('signOut', 'timeOut', 'Sign Out');
    if (dto.signIn === false || dto.timeOut === false || dto.signOut === false)
      throw new BadRequestException(
        "A completed safety-checklist step can't be undone",
      );
    c.safety = safety;
    c.markModified('safety');
    await c.save();
    if (changed.length)
      await this.record(actor, 'OtCase', c.id, c.caseNo, {
        change: 'checklist',
        items: changed,
      });
    return this.toResponse(c);
  }

  async time(actor: PartnerActor, id: string, dto: OtTimeDto) {
    const c = await this.load(actor, id);
    const inRoom = [
      'wheeledIn',
      'anaesthesiaStart',
      'incision',
      'closure',
      'wheeledOut',
    ];
    if (inRoom.includes(dto.field) && c.status !== OtStatus.IN_THEATRE)
      throw new BadRequestException(
        'Theatre times are recorded while the patient is in theatre',
      );
    if (
      (dto.field === 'recoveryIn' || dto.field === 'recoveryOut') &&
      c.status !== OtStatus.RECOVERY
    )
      throw new BadRequestException(
        'Recovery times are recorded in the recovery bay',
      );
    const gate = timeGate(dto.field, c.safety ?? {});
    if (gate) throw new BadRequestException(gate);
    const at = dto.at ? new Date(dto.at) : new Date();
    if (at.getTime() > Date.now() + 2 * MIN)
      throw new BadRequestException("Times can't be in the future");
    const times = c.times ?? {};
    const order: [keyof typeof times, keyof typeof times][] = [
      ['anaesthesiaStart', 'incision'],
      ['incision', 'closure'],
      ['wheeledIn', 'wheeledOut'],
      ['recoveryIn', 'recoveryOut'],
    ];
    times[dto.field] = at;
    for (const [a, b] of order)
      if (times[a] && times[b] && times[b] < times[a])
        throw new BadRequestException(`${b} can't be before ${a}`);
    c.times = times;
    c.markModified('times');
    await c.save();
    await this.record(actor, 'OtCase', c.id, c.caseNo, {
      change: `time_${dto.field}`,
    });
    return this.toResponse(c);
  }

  async postOp(actor: PartnerActor, id: string, dto: OtPostOpDto) {
    const c = await this.load(actor, id);
    if (![OtStatus.IN_THEATRE, OtStatus.RECOVERY].includes(c.status))
      throw new BadRequestException(
        'The operation note is written in theatre or recovery',
      );
    c.postOp = { ...dto, byName: actor.member.fullName, at: new Date() };
    await c.save();
    await this.record(actor, 'OtCase', c.id, c.caseNo, {
      change: 'operation_note',
    });
    return this.toResponse(c);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async team(
    actor: PartnerActor,
    surgeonId: string,
    anaesthetistId: string | undefined,
    anaesthesia: string,
  ) {
    const doctor = (id: string) =>
      this.memberModel
        .findOne({
          _id: this.oid(id),
          providerId: actor.provider._id,
          role: StaffRole.DOCTOR,
          status: MemberStatus.ACTIVE,
        })
        .exec();
    const surgeon = await doctor(surgeonId);
    if (!surgeon)
      throw new BadRequestException(
        'Choose an active doctor of this hospital as surgeon',
      );
    let anaesthetist: PartnerMemberDocument | null = null;
    if (anaesthetistId) {
      anaesthetist = await doctor(anaesthetistId);
      if (!anaesthetist)
        throw new BadRequestException(
          'Choose an active doctor of this hospital as anaesthetist',
        );
      if (anaesthetist._id.equals(surgeon._id))
        throw new BadRequestException(
          "The surgeon can't also be the anaesthetist",
        );
    } else if (!isLocalOnly(anaesthesia)) {
      throw new BadRequestException(
        `${anaesthesia[0].toUpperCase()}${anaesthesia.slice(1)} anaesthesia needs an anaesthetist`,
      );
    }
    return { surgeon, anaesthetist };
  }

  /** Room, surgeon and anaesthetist must be free; the team on its duty roster unless overridden. */
  private async checkClashes(
    actor: PartnerActor,
    slot: { start: Date; end: Date },
    roomId: Types.ObjectId,
    surgeon: PartnerMemberDocument,
    anaesthetist: PartnerMemberDocument | null,
    exceptId: Types.ObjectId | null,
    allowOffRoster: boolean,
  ) {
    const people = [surgeon._id, ...(anaesthetist ? [anaesthetist._id] : [])];
    const filter: QueryFilter<OtCaseDocument> = {
      providerId: actor.provider._id,
      status: { $in: BLOCKING },
      start: { $lt: slot.end },
      end: { $gt: slot.start },
      $or: [
        { roomId },
        { 'surgeon.memberId': { $in: people } },
        { 'anaesthetist.memberId': { $in: people } },
      ],
      ...(exceptId && { _id: { $ne: exceptId } }),
    };
    const clashes = await this.caseModel.find(filter).limit(5).exec();
    for (const x of clashes) {
      if (!overlaps(slot, x)) continue;
      const when = `${hhmm(x.start)}–${hhmm(x.end)}`;
      if (x.roomId.equals(roomId))
        throw new ConflictException(
          `${x.roomName} is booked ${when} (${x.caseNo}, ${x.procedure})`,
        );
      const who = [x.surgeon, x.anaesthetist].find(
        (p) => p?.memberId && people.some((id) => id.equals(p.memberId)),
      );
      throw new ConflictException(
        `${who?.name ?? 'A team member'} is in ${x.roomName} ${when} (${x.caseNo})`,
      );
    }
    if (allowOffRoster) return;
    for (const m of [surgeon, anaesthetist]) {
      if (!m) continue;
      if (!onRoster(m.dutySchedule ?? [], slot.start, slot.end)) {
        const blocks = rosterFor(m.dutySchedule ?? [], slot.start)
          .map(
            (b) =>
              `${String(Math.floor(b.start / 60)).padStart(2, '0')}:${String(b.start % 60).padStart(2, '0')}–${String(Math.floor(b.end / 60)).padStart(2, '0')}:${String(b.end % 60).padStart(2, '0')}`,
          )
          .join(', ');
        throw new ConflictException(
          `OFF_ROSTER: ${m.fullName} isn't on the duty roster ${hhmm(slot.start)}–${hhmm(slot.end)} (${blocks ? `on duty ${blocks}` : 'off that day'})`,
        );
      }
    }
  }

  private async patient(
    actor: PartnerActor,
    dto: {
      patientName?: string;
      age?: number;
      gender?: string;
      admissionId?: string;
    },
  ) {
    if (dto.admissionId) {
      const adm = await this.admissionModel
        .findOne({
          _id: this.oid(dto.admissionId),
          providerId: actor.provider._id,
        })
        .exec();
      if (!adm) throw new BadRequestException('That admission was not found');
      return {
        admissionId: adm._id,
        admissionNo: adm.admissionNo,
        patientName: dto.patientName || adm.patientName,
        age: dto.age ?? adm.age,
        gender: dto.gender ?? adm.gender,
      };
    }
    if (!dto.patientName)
      throw new BadRequestException(
        "Enter the patient's name or pick their admission",
      );
    return { patientName: dto.patientName, age: dto.age, gender: dto.gender };
  }

  private async activeRoom(actor: PartnerActor, id: string) {
    const room = await this.roomModel
      .findOne({ _id: this.oid(id), providerId: actor.provider._id })
      .exec();
    if (!room) throw new BadRequestException('Theatre not found');
    if (!room.active)
      throw new BadRequestException(`${room.name} is closed for bookings`);
    return room;
  }

  private async nextCaseNo(actor: PartnerActor, at: Date, bump: number) {
    const start = dayStart(at);
    const count = await this.caseModel.countDocuments({
      providerId: actor.provider._id,
      start: { $gte: start, $lt: new Date(start.getTime() + 24 * 60 * MIN) },
    });
    return `OT-${dayKey(at)}-${String(count + 1 + bump).padStart(2, '0')}`;
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Not found');
    return new Types.ObjectId(id);
  }

  private async load(actor: PartnerActor, id: string) {
    const c = await this.caseModel
      .findOne({ _id: this.oid(id), providerId: actor.provider._id })
      .exec();
    if (!c) throw new NotFoundException('Case not found');
    return c;
  }

  private toResponse(c: OtCaseDocument) {
    const t = c.times ?? {};
    const iso = (d?: Date) => d?.toISOString() ?? null;
    const tickOut = (x?: { at: Date; byName?: string }) =>
      x ? { at: x.at.toISOString(), byName: x.byName ?? null } : null;
    const preOp = (c.preOp ?? {}) as Record<
      string,
      { at: Date; byName?: string } | undefined
    >;
    return {
      id: c.id,
      caseNo: c.caseNo,
      roomId: c.roomId.toString(),
      roomName: c.roomName,
      start: c.start.toISOString(),
      end: c.end.toISOString(),
      durationMinutes: Math.round((c.end.getTime() - c.start.getTime()) / MIN),
      patientName: c.patientName,
      age: c.age ?? null,
      gender: c.gender ?? null,
      admissionId: c.admissionId?.toString() ?? null,
      admissionNo: c.admissionNo ?? null,
      procedure: c.procedure,
      side: c.side,
      priority: c.priority,
      department: c.department ?? null,
      surgeon: {
        id: c.surgeon.memberId?.toString() ?? null,
        name: c.surgeon.name,
      },
      anaesthetist: c.anaesthetist
        ? {
            id: c.anaesthetist.memberId?.toString() ?? null,
            name: c.anaesthetist.name,
          }
        : null,
      anaesthesia: c.anaesthesia,
      assistants: c.assistants.map((a) => a.name),
      notes: c.notes ?? null,
      status: c.status,
      preOp: Object.fromEntries(
        PRE_OP_ITEMS.map((k) => [k, tickOut(preOp[k])]),
      ),
      safety: {
        signIn: tickOut(c.safety?.signIn),
        timeOut: tickOut(c.safety?.timeOut),
        signOut: tickOut(c.safety?.signOut),
      },
      times: {
        wheeledIn: iso(t.wheeledIn),
        anaesthesiaStart: iso(t.anaesthesiaStart),
        incision: iso(t.incision),
        closure: iso(t.closure),
        wheeledOut: iso(t.wheeledOut),
        recoveryIn: iso(t.recoveryIn),
        recoveryOut: iso(t.recoveryOut),
      },
      durations: {
        lateStart: t.wheeledIn
          ? Math.max(0, minutes(c.start, t.wheeledIn) ?? 0)
          : null,
        anaesthesiaToIncision: minutes(t.anaesthesiaStart, t.incision),
        surgery: minutes(t.incision, t.closure),
        inTheatre: minutes(t.wheeledIn, t.wheeledOut),
        recovery: minutes(t.recoveryIn, t.recoveryOut),
      },
      postOp: c.postOp
        ? {
            procedureDone: c.postOp.procedureDone ?? null,
            findings: c.postOp.findings ?? null,
            complications: c.postOp.complications ?? null,
            bloodLossMl: c.postOp.bloodLossMl ?? null,
            implants: c.postOp.implants ?? null,
            specimens: c.postOp.specimens ?? null,
            disposition: c.postOp.disposition ?? null,
            instructions: c.postOp.instructions ?? null,
            byName: c.postOp.byName ?? null,
            at: iso(c.postOp.at),
          }
        : null,
      stageLog: c.stageLog.map((s) => ({
        at: s.at.toISOString(),
        from: s.from,
        to: s.to,
        byName: s.byName ?? null,
        note: s.note ?? null,
      })),
      cancelReason: c.cancelReason ?? null,
      bookedByName: c.bookedByName ?? null,
    };
  }

  private record(
    actor: PartnerActor,
    targetType: string,
    targetId: string,
    label: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_OT_UPDATE,
      targetType,
      targetId,
      metadata: { providerId: actor.provider.id, label, ...metadata },
      ipAddress: actor.ip,
    });
  }
}
