import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { LiveBus } from '../../common/live/live-bus.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { PartnerNotifierService } from '../notify/partner-notifier.service';
import { PartnerTrigger } from '../notify/partner-triggers';
import { dayStart } from '../hospital/clock';
import {
  QcMaterial,
  QcMaterialDocument,
  QcRun,
  QcRunDocument,
} from './schemas/qc.schema';
import { RULE_TEXT, evaluateRun, qcStats } from './westgard';
import {
  AddQcRunDto,
  CreateQcMaterialDto,
  QcRunsQueryDto,
  ReviewQcRunDto,
  UpdateQcMaterialDto,
} from './dto/qc.dto';

/** Earlier runs the multi-rules look back over. */
const RULE_HISTORY = 9;

/**
 * Laboratory quality control: control materials with their targets, daily
 * control runs evaluated by the Westgard rules, Levey-Jennings data, and a
 * record of corrective action on every warning or rejection.
 */
@Injectable()
export class PartnerQcService {
  constructor(
    @InjectModel(QcMaterial.name)
    private readonly materialModel: Model<QcMaterialDocument>,
    @InjectModel(QcRun.name)
    private readonly runModel: Model<QcRunDocument>,
    private readonly notifier: PartnerNotifierService,
    private readonly audit: AuditLogService,
    private readonly live: LiveBus,
  ) {}

  /** Materials with today's status: run or not, and the latest outcome. */
  async materials(actor: PartnerActor) {
    const materials = await this.materialModel
      .find({ providerId: actor.provider._id })
      .sort({ active: -1, analyte: 1, level: 1 })
      .exec();
    const today = dayStart(new Date());
    const latest = await this.runModel
      .aggregate<{ _id: Types.ObjectId; last: QcRun; today: number }>([
        { $match: { providerId: actor.provider._id } },
        { $sort: { at: -1 } },
        {
          $group: {
            _id: '$materialId',
            last: { $first: '$$ROOT' },
            today: { $sum: { $cond: [{ $gte: ['$at', today] }, 1, 0] } },
          },
        },
      ])
      .exec();
    const byMaterial = new Map(latest.map((l) => [l._id.toString(), l]));
    return materials.map((m) => {
      const l = byMaterial.get(m.id);
      return {
        ...this.materialView(m),
        runsToday: l?.today ?? 0,
        lastRun: l?.last
          ? {
              at: l.last.at.toISOString(),
              value: l.last.value,
              status: l.last.status,
              rules: l.last.rules,
              reviewed: !!l.last.reviewedAt,
            }
          : null,
      };
    });
  }

  async createMaterial(actor: PartnerActor, dto: CreateQcMaterialDto) {
    const m = await this.materialModel.create({
      providerId: actor.provider._id,
      analyte: dto.analyte.trim(),
      unit: dto.unit?.trim() || undefined,
      level: dto.level.trim(),
      lot: dto.lot.trim(),
      lotExpiry: dto.lotExpiry ? new Date(dto.lotExpiry) : undefined,
      instrument: dto.instrument?.trim() || undefined,
      targetMean: dto.targetMean,
      targetSd: dto.targetSd,
    });
    await this.record(
      actor,
      m.id,
      `QC material added: ${m.analyte} ${m.level}, lot ${m.lot} (target ${m.targetMean} ± ${m.targetSd})`,
    );
    return this.materialView(m);
  }

  async updateMaterial(
    actor: PartnerActor,
    id: string,
    dto: UpdateQcMaterialDto,
  ) {
    const m = await this.load(actor, id);
    const before = `${m.targetMean} ± ${m.targetSd}, lot ${m.lot}`;
    if (dto.analyte !== undefined) m.analyte = dto.analyte.trim();
    if (dto.unit !== undefined) m.unit = dto.unit.trim() || undefined;
    if (dto.level !== undefined) m.level = dto.level.trim();
    if (dto.lot !== undefined) m.lot = dto.lot.trim();
    if (dto.lotExpiry !== undefined) m.lotExpiry = new Date(dto.lotExpiry);
    if (dto.instrument !== undefined)
      m.instrument = dto.instrument.trim() || undefined;
    if (dto.targetMean !== undefined) m.targetMean = dto.targetMean;
    if (dto.targetSd !== undefined) m.targetSd = dto.targetSd;
    if (dto.active !== undefined) m.active = dto.active;
    await m.save();
    await this.record(
      actor,
      m.id,
      `QC material ${m.analyte} ${m.level} updated: ${before} → ${m.targetMean} ± ${m.targetSd}, lot ${m.lot}${m.active ? '' : ' (retired)'}`,
    );
    return this.materialView(m);
  }

  /** Levey-Jennings data for a material, with observed statistics. */
  async runs(actor: PartnerActor, id: string, q: QcRunsQueryDto) {
    const m = await this.load(actor, id);
    const since = new Date(Date.now() - (q.days ?? 30) * 86_400_000);
    const runs = await this.runModel
      .find({
        providerId: actor.provider._id,
        materialId: m._id,
        at: { $gte: since },
      })
      .sort({ at: 1 })
      .limit(500)
      .exec();
    return {
      material: this.materialView(m),
      runs: runs.map((r) => this.runView(r)),
      // Observed statistics leave out rejected runs, as a lab would.
      stats: qcStats(
        runs.filter((r) => r.status !== 'reject').map((r) => r.value),
      ),
    };
  }

  async addRun(actor: PartnerActor, id: string, dto: AddQcRunDto) {
    const m = await this.load(actor, id);
    if (!m.active)
      throw new BadRequestException('This control material is retired');
    const at = dto.at ? new Date(dto.at) : new Date();
    if (at.getTime() > Date.now() + 5 * 60_000)
      throw new BadRequestException('A control run can’t be in the future');
    // Earlier runs on the current target that weren't rejected feed the multi-rules.
    const earlier = await this.runModel
      .find({
        providerId: actor.provider._id,
        materialId: m._id,
        at: { $lt: at },
        status: { $ne: 'reject' },
        mean: m.targetMean,
        sd: m.targetSd,
      })
      .sort({ at: -1 })
      .limit(RULE_HISTORY)
      .select('value')
      .lean()
      .exec();
    const evaluation = evaluateRun(
      dto.value,
      m.targetMean,
      m.targetSd,
      earlier.reverse().map((r) => r.value),
    );
    const run = await this.runModel.create({
      providerId: actor.provider._id,
      materialId: m._id,
      value: dto.value,
      at,
      byName: actor.member.fullName,
      mean: m.targetMean,
      sd: m.targetSd,
      ...evaluation,
      note: dto.note?.trim() || undefined,
    });
    const name = `${m.analyte} ${m.level}`;
    await this.record(
      actor,
      m.id,
      `QC ${name}: ${dto.value}${m.unit ? ` ${m.unit}` : ''} (z ${evaluation.z}) — ${evaluation.status}${evaluation.rules.length ? ` [${evaluation.rules.join(', ')}]` : ''}`,
    );
    if (evaluation.status === 'reject')
      await this.notifier.emit(actor.provider._id, {
        trigger: PartnerTrigger.QC_REJECTED,
        title: `QC rejected — ${name}`,
        message: `${m.instrument ? `${m.instrument}: ` : ''}${name} control ${dto.value}${m.unit ? ` ${m.unit}` : ''} violates ${evaluation.rules.map((r) => `${r} (${RULE_TEXT[r]})`).join(', ')}. Hold patient results for ${m.analyte} until it's corrected and a repeat control passes.`,
        safeMessage: `A quality-control run for ${m.analyte} was rejected — hold patient results for it and review in the Ayuva Partner Portal.`,
        route: '/partner/lab/qc',
        data: { materialId: m.id, analyte: m.analyte, rules: evaluation.rules },
        excludeUserId: actor.userId,
      });
    return this.runView(run);
  }

  async review(actor: PartnerActor, runId: string, dto: ReviewQcRunDto) {
    if (!Types.ObjectId.isValid(runId))
      throw new NotFoundException('QC run not found');
    const run = await this.runModel
      .findOne({ _id: runId, providerId: actor.provider._id })
      .exec();
    if (!run) throw new NotFoundException('QC run not found');
    if (run.status === 'accept')
      throw new BadRequestException('This run passed — nothing to review');
    run.reviewNote = dto.note.trim();
    run.reviewedBy = actor.member.fullName;
    run.reviewedAt = new Date();
    await run.save();
    await this.record(
      actor,
      run.materialId.toString(),
      `QC corrective action: ${run.reviewNote}`,
    );
    return this.runView(run);
  }

  private async load(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Control material not found');
    const m = await this.materialModel
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!m) throw new NotFoundException('Control material not found');
    return m;
  }

  private record(actor: PartnerActor, targetId: string, label: string) {
    // QC state gates report release and colours the QC tab: refresh every lab screen.
    this.live.publish(actor.provider._id, 'lab');
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_LAB_QC,
      targetType: 'QcMaterial',
      targetId,
      metadata: { providerId: actor.provider.id, label },
      ipAddress: actor.ip,
    });
  }

  private materialView(m: QcMaterialDocument) {
    return {
      id: m.id,
      analyte: m.analyte,
      unit: m.unit ?? null,
      level: m.level,
      lot: m.lot,
      lotExpiry: m.lotExpiry?.toISOString() ?? null,
      instrument: m.instrument ?? null,
      targetMean: m.targetMean,
      targetSd: m.targetSd,
      active: m.active,
    };
  }

  private runView(r: QcRunDocument) {
    return {
      id: r.id,
      value: r.value,
      at: r.at.toISOString(),
      byName: r.byName,
      mean: r.mean,
      sd: r.sd,
      z: r.z,
      rules: r.rules,
      status: r.status as 'accept' | 'warning' | 'reject',
      note: r.note ?? null,
      reviewNote: r.reviewNote ?? null,
      reviewedBy: r.reviewedBy ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    };
  }
}
