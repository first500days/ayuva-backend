import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { recentPast } from '../../common/utils/recent-past';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { LiveBus } from '../../common/live/live-bus.service';
import { buildPanel, type LabPoint } from '../clinical/lab-panel';
import { PartnerLabValuesService } from '../clinical/partner-lab-values.service';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import { PartnerActor } from '../rbac/partner-perm.guard';
import {
  CreateMonitorDto,
  RecordVitalsDto,
  UpdateMonitorDto,
} from './dto/telemetry.dto';
import {
  EARLY_WARNING_NOTE,
  type EarlyWarning,
  type Observations,
  assess,
  median,
} from './early-warning';
import {
  AdmissionDocument,
  AdmissionStatus,
  PartnerAdmission,
} from './schemas/admission.schema';
import {
  MonitorDocument,
  PartnerMonitor,
  PartnerVital,
  VitalDocument,
} from './schemas/telemetry.schema';
import { Ward, WardDocument } from './schemas/ward.schema';

/** Rolling window for the numbers a warning is judged on. */
const RECENT_MS = 5 * 60_000;
/** A monitor's numbers are stored once a minute; the waveform is never stored. */
const SAVE_EVERY_MS = 60_000;
const BINDING_TTL_MS = 10_000;
/** A monitor silent this long no longer counts as a current reading. */
const MONITOR_STALE_MS = 15 * 60_000;
/** A charted observation counts for this long (the usual NEWS2 round). */
const MANUAL_STALE_MS = 8 * 3_600_000;
const ALERT_REPEAT_MS = 30 * 60_000;

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const newKey = () => `amon_${randomBytes(24).toString('hex')}`;

export interface IncomingFrame {
  hr?: unknown;
  spo2?: unknown;
  rr?: unknown;
  ecg?: unknown;
  fs?: unknown;
}

/** A connected device and what it has sent recently. */
export interface LiveMonitor {
  id: string;
  providerId: string;
  wardId?: string;
  bedId?: string;
  admissionId: string | null;
  boundAt: number;
  samples: { at: number; hr?: number; spo2?: number; rr?: number }[];
  savedAt: number;
}

const inRange = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
    ? v
    : undefined;

const round1 = (v: number | undefined) =>
  v === undefined ? undefined : Math.round(v * 10) / 10;

/** Keeps only believable values, so a faulty sensor can't write nonsense. */
export function cleanFrame(raw: IncomingFrame) {
  const hr = inRange(raw.hr, 0, 350);
  const spo2 = inRange(raw.spo2, 0, 100);
  const rr = inRange(raw.rr, 0, 120);
  const fs = inRange(raw.fs, 50, 1000);
  const ecg =
    Array.isArray(raw.ecg) &&
    raw.ecg.length <= 2000 &&
    raw.ecg.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? (raw.ecg as number[])
      : undefined;
  return { hr, spo2, rr, ecg: fs ? ecg : undefined, fs: ecg ? fs : undefined };
}

/** Combines stored readings, newest first, into one set of current observations. */
export function currentObservations(
  rows: {
    at: Date;
    source: string;
    hr?: number;
    spo2?: number;
    rr?: number;
    systolic?: number;
    diastolic?: number;
    tempC?: number;
    avpu?: string;
    onOxygen?: boolean;
  }[],
  now: number,
) {
  const out: Observations & { diastolic?: number; at?: string } = {};
  for (const r of rows) {
    const age = now - r.at.getTime();
    const limit = r.source === 'monitor' ? MONITOR_STALE_MS : MANUAL_STALE_MS;
    if (age > limit) continue;
    out.at ??= r.at.toISOString();
    out.hr ??= r.hr;
    out.spo2 ??= r.spo2;
    out.rr ??= r.rr;
    out.systolic ??= r.systolic;
    out.diastolic ??= r.diastolic;
    out.tempC ??= r.tempC;
    out.avpu ??= r.avpu as Observations['avpu'];
    out.onOxygen ??= r.onOxygen;
  }
  return out;
}

/**
 * Live patient telemetry: devices stream vitals, numbers are stored once a
 * minute, and staff can chart what no device measures. Each patient's numbers
 * are combined with recent lab results into an early-warning screen.
 */
@Injectable()
export class PartnerTelemetryService {
  private readonly logger = new Logger(PartnerTelemetryService.name);
  private readonly lastAlert = new Map<string, { level: string; at: number }>();

  constructor(
    @InjectModel(PartnerMonitor.name)
    private readonly monitorModel: Model<MonitorDocument>,
    @InjectModel(PartnerVital.name)
    private readonly vitalModel: Model<VitalDocument>,
    @InjectModel(PartnerAdmission.name)
    private readonly admissionModel: Model<AdmissionDocument>,
    @InjectModel(Ward.name)
    private readonly wardModel: Model<WardDocument>,
    private readonly labValues: PartnerLabValuesService,
    private readonly notifier: PartnerNotifierService,
    private readonly audit: AuditLogService,
    private readonly live: LiveBus,
  ) {}

  // ── Devices ───────────────────────────────────────────────────────────────

  async connectDevice(key: string): Promise<LiveMonitor | null> {
    const m = await this.monitorModel
      .findOne({ keyHash: hashKey(key), active: true })
      .exec();
    if (!m) return null;
    return {
      id: m.id,
      providerId: m.providerId.toString(),
      ...(m.wardId && { wardId: m.wardId.toString() }),
      ...(m.bedId && { bedId: m.bedId.toString() }),
      admissionId: null,
      boundAt: 0,
      samples: [],
      savedAt: Date.now(),
    };
  }

  /** The patient in this monitor's bed right now, looked up every few seconds. */
  private async admissionOn(state: LiveMonitor, now: number) {
    if (now - state.boundAt < BINDING_TTL_MS) return state.admissionId;
    state.boundAt = now;
    state.admissionId = null;
    if (!state.wardId || !state.bedId) return null;
    const ward = await this.wardModel
      .findOne({ _id: state.wardId, providerId: state.providerId })
      .select('beds')
      .lean()
      .exec();
    const bed = ward?.beds.find((b) => b._id.toString() === state.bedId);
    state.admissionId = bed?.admissionId?.toString() ?? null;
    return state.admissionId;
  }

  async ingest(state: LiveMonitor, raw: IncomingFrame): Promise<void> {
    const now = Date.now();
    const frame = cleanFrame(raw);
    const admissionId = await this.admissionOn(state, now);
    // Nobody in the bed: nothing to show, and nothing is stored.
    if (!admissionId) return;
    state.samples.push({
      at: now,
      hr: frame.hr,
      spo2: frame.spo2,
      rr: frame.rr,
    });
    state.samples = state.samples.filter((s) => now - s.at <= RECENT_MS);
    this.live.frame({
      providerId: state.providerId,
      admissionId,
      at: now,
      ...(frame.hr !== undefined && { hr: frame.hr }),
      ...(frame.spo2 !== undefined && { spo2: frame.spo2 }),
      ...(frame.rr !== undefined && { rr: frame.rr }),
      ...(frame.ecg && frame.fs && { ecg: frame.ecg, fs: frame.fs }),
    });
    if (now - state.savedAt >= SAVE_EVERY_MS) await this.saveMinute(state, now);
  }

  private async saveMinute(state: LiveMonitor, now: number) {
    state.savedAt = now;
    if (!state.admissionId) return;
    const lastMinute = state.samples.filter((s) => now - s.at <= SAVE_EVERY_MS);
    const mid = (k: 'hr' | 'spo2' | 'rr') =>
      round1(
        median(lastMinute.flatMap((s) => (s[k] === undefined ? [] : [s[k]]))),
      );
    const [hr, spo2, rr] = [mid('hr'), mid('spo2'), mid('rr')];
    if (hr === undefined && spo2 === undefined && rr === undefined) return;
    await this.vitalModel.create({
      providerId: state.providerId,
      admissionId: state.admissionId,
      at: new Date(now),
      hr,
      spo2,
      rr,
      source: 'monitor',
    });
    void this.monitorModel
      .updateOne({ _id: state.id }, { $set: { lastSeenAt: new Date(now) } })
      .exec()
      .catch(() => undefined);
    this.live.publish(state.providerId, 'telemetry');
    await this.reviewPatient(state.providerId, state.admissionId);
  }

  async listMonitors(actor: PartnerActor) {
    const rows = await this.monitorModel
      .find({ providerId: actor.provider._id })
      .sort({ name: 1 })
      .exec();
    return rows.map((m) => this.monitorView(m));
  }

  async createMonitor(actor: PartnerActor, dto: CreateMonitorDto) {
    if (dto.bedId) await this.assertBed(actor, dto.wardId, dto.bedId);
    const key = newKey();
    const m = await this.monitorModel.create({
      providerId: actor.provider._id,
      name: dto.name.trim(),
      keyHash: hashKey(key),
      keyHint: key.slice(-4),
      wardId: dto.wardId,
      bedId: dto.bedId,
    });
    await this.recordChange(actor, `Monitor added: ${m.name}`, m.id);
    return { monitor: this.monitorView(m), key };
  }

  async updateMonitor(actor: PartnerActor, id: string, dto: UpdateMonitorDto) {
    const m = await this.loadMonitor(actor, id);
    if (dto.bedId) await this.assertBed(actor, dto.wardId, dto.bedId);
    if (dto.name !== undefined) m.name = dto.name.trim();
    if (dto.wardId !== undefined) m.set('wardId', dto.wardId);
    if (dto.bedId !== undefined) m.set('bedId', dto.bedId);
    if (dto.active !== undefined) m.active = dto.active;
    await m.save();
    await this.recordChange(actor, `Monitor updated: ${m.name}`, m.id);
    return this.monitorView(m);
  }

  async rotateKey(actor: PartnerActor, id: string) {
    const m = await this.loadMonitor(actor, id);
    const key = newKey();
    m.keyHash = hashKey(key);
    m.keyHint = key.slice(-4);
    await m.save();
    await this.recordChange(actor, `Monitor key replaced: ${m.name}`, m.id);
    return { monitor: this.monitorView(m), key };
  }

  private async assertBed(
    actor: PartnerActor,
    wardId: string | undefined,
    bedId: string,
  ) {
    const ward = wardId
      ? await this.wardModel
          .findOne({ _id: wardId, providerId: actor.provider._id })
          .select('beds')
          .lean()
          .exec()
      : null;
    if (!ward?.beds.some((b) => b._id.toString() === bedId))
      throw new BadRequestException('Choose a bed in one of your wards');
  }

  private async loadMonitor(actor: PartnerActor, id: string) {
    const m = Types.ObjectId.isValid(id)
      ? await this.monitorModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!m) throw new NotFoundException('Monitor not found');
    return m;
  }

  private monitorView(m: MonitorDocument) {
    return {
      id: m.id,
      name: m.name,
      keyHint: m.keyHint,
      wardId: m.wardId?.toString() ?? null,
      bedId: m.bedId?.toString() ?? null,
      active: m.active,
      lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
    };
  }

  // ── Patients ──────────────────────────────────────────────────────────────

  async recordVitals(actor: PartnerActor, id: string, dto: RecordVitalsDto) {
    const { takenAt, ...readings } = dto;
    if (!Object.values(readings).some((v) => v !== undefined))
      throw new BadRequestException('Enter at least one reading');
    // Charted while the ward was offline: keep when they were really taken.
    const at = recentPast(takenAt) ?? new Date();
    const a = await this.loadAdmitted(actor, id);
    await this.vitalModel.create({
      ...readings,
      providerId: actor.provider._id,
      admissionId: a._id,
      at,
      source: 'manual',
      byName: actor.member.fullName,
    });
    await this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_ADMISSION_UPDATE,
      targetType: 'PartnerAdmission',
      targetId: a.id,
      metadata: {
        providerId: actor.provider.id,
        ...(a.patientId && { patientId: a.patientId.toString() }),
        label: `${a.admissionNo}: vitals recorded`,
      },
      ipAddress: actor.ip,
    });
    this.live.publish(actor.provider._id, 'telemetry');
    await this.reviewPatient(actor.provider.id, a.id);
    return (await this.boardFor(actor.provider._id, [a]))[0];
  }

  async history(actor: PartnerActor, id: string) {
    const a = await this.loadAny(actor, id);
    const rows = await this.vitalModel
      .find({
        admissionId: a._id,
        at: { $gte: new Date(Date.now() - 24 * 3_600_000) },
      })
      .sort({ at: -1 })
      .limit(1500)
      .lean()
      .exec();
    return rows.map((r) => ({
      at: r.at.toISOString(),
      hr: r.hr ?? null,
      spo2: r.spo2 ?? null,
      rr: r.rr ?? null,
      systolic: r.systolic ?? null,
      diastolic: r.diastolic ?? null,
      tempC: r.tempC ?? null,
      avpu: r.avpu ?? null,
      onOxygen: r.onOxygen ?? null,
      source: r.source,
      byName: r.byName ?? null,
    }));
  }

  async board(actor: PartnerActor) {
    const admitted = await this.admissionModel
      .find({
        providerId: actor.provider._id,
        status: AdmissionStatus.ADMITTED,
      })
      .sort({ wardName: 1, bedLabel: 1 })
      .exec();
    return {
      patients: await this.boardFor(actor.provider._id, admitted),
      note: EARLY_WARNING_NOTE,
    };
  }

  private async boardFor(
    providerId: Types.ObjectId,
    admissions: AdmissionDocument[],
  ) {
    const now = Date.now();
    const [vitals, labs, monitors] = await Promise.all([
      this.vitalModel
        .find({
          admissionId: { $in: admissions.map((a) => a._id) },
          at: { $gte: new Date(now - MANUAL_STALE_MS) },
        })
        .sort({ at: -1 })
        .lean()
        .exec(),
      this.labValues.forAdmissions(providerId, admissions),
      this.monitorModel
        .find({ providerId, active: true })
        .select('bedId')
        .lean()
        .exec(),
    ]);
    const monitoredBeds = new Set(
      monitors.flatMap((m) => (m.bedId ? [m.bedId.toString()] : [])),
    );
    return admissions.map((a) => {
      const obs = currentObservations(
        vitals.filter((v) => v.admissionId.equals(a._id)),
        now,
      );
      const warning = this.warningFor(obs, labs.get(a.id) ?? []);
      return {
        admissionId: a.id,
        admissionNo: a.admissionNo,
        patientName: a.patientName,
        wardName: a.wardName,
        bedLabel: a.bedLabel,
        attendingName: a.attendingName ?? null,
        monitored: monitoredBeds.has(a.bedId.toString()),
        vitals: {
          at: obs.at ?? null,
          hr: obs.hr ?? null,
          spo2: obs.spo2 ?? null,
          rr: obs.rr ?? null,
          systolic: obs.systolic ?? null,
          diastolic: obs.diastolic ?? null,
          tempC: obs.tempC ?? null,
          avpu: obs.avpu ?? null,
          onOxygen: obs.onOxygen ?? null,
        },
        warning,
      };
    });
  }

  private warningFor(
    obs: Observations,
    points: LabPoint[],
  ): EarlyWarning | null {
    // No observations at all is "not assessed", not "well".
    const measured = [
      obs.hr,
      obs.spo2,
      obs.rr,
      obs.systolic,
      obs.tempC,
      obs.avpu,
      obs.onOxygen,
    ].some((v) => v !== undefined);
    return measured ? assess(obs, buildPanel(points)) : null;
  }

  /** Tells the care team when someone newly meets a serious threshold. */
  private async reviewPatient(providerId: string, admissionId: string) {
    try {
      const a = await this.admissionModel.findById(admissionId).exec();
      if (!a || a.status !== AdmissionStatus.ADMITTED) return;
      const [row] = await this.boardFor(new Types.ObjectId(providerId), [a]);
      const level = row?.warning?.level ?? 'none';
      if (level !== 'high' && level !== 'sepsis_screen') {
        this.lastAlert.delete(admissionId);
        return;
      }
      const prior = this.lastAlert.get(admissionId);
      const now = Date.now();
      const worse = prior?.level === 'high' && level === 'sepsis_screen';
      if (prior && !worse && now - prior.at < ALERT_REPEAT_MS) return;
      this.lastAlert.set(admissionId, { level, at: now });
      await this.notifier.emit(providerId, {
        trigger: PartnerTrigger.EARLY_WARNING,
        title: `Early warning: ${a.admissionNo}`,
        message: `A patient on ${a.wardName}, bed ${a.bedLabel}, has met early-warning criteria. Open the monitor to review.`,
        safeMessage: `Early warning for admission ${a.admissionNo}.`,
        route: '/partner/telemetry',
        params: { admissionId: a.id },
        data: { admissionId: a.id, admissionNo: a.admissionNo, level },
        ...(a.attendingMemberId && {
          memberIds: [a.attendingMemberId.toString()],
        }),
      });
    } catch (err) {
      this.logger.error(
        `Early-warning review failed for ${admissionId}`,
        (err as Error).stack,
      );
    }
  }

  private async loadAny(actor: PartnerActor, id: string) {
    const a = Types.ObjectId.isValid(id)
      ? await this.admissionModel.findOne({
          _id: id,
          providerId: actor.provider._id,
        })
      : null;
    if (!a) throw new NotFoundException('Admission not found');
    return a;
  }

  private async loadAdmitted(actor: PartnerActor, id: string) {
    const a = await this.loadAny(actor, id);
    if (a.status !== AdmissionStatus.ADMITTED)
      throw new BadRequestException('This patient has been discharged');
    return a;
  }

  private recordChange(actor: PartnerActor, label: string, id: string) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_ASSET_UPDATE,
      targetType: 'PartnerMonitor',
      targetId: id,
      metadata: { providerId: actor.provider.id, label },
      ipAddress: actor.ip,
    });
  }
}
