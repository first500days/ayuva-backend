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
import { LabOrderDocument, PartnerLabOrder } from './schemas/lab-order.schema';
import {
  ColdChainRun,
  ColdChainRunDocument,
} from './schemas/cold-chain-run.schema';
import {
  RANGE_PRESETS,
  RangePreset,
  parseLoggerCsv,
  summarize,
} from './cold-chain';
import {
  AddReadingsDto,
  ColdChainQueryDto,
  CreateColdChainRunDto,
  LoggerUploadDto,
} from './dto/cold-chain.dto';

/** Readings kept per box (a minute-by-minute logger covers a long day). */
const MAX_READINGS = 2000;
const MAX_VIALS = 60;

/** A vial's transit as reception sees it. */
export interface VialTransit {
  runId: string;
  boxLabel: string;
  rangeLabel: string;
  status: string;
  verdict: string;
  minutesOut: number;
}

/**
 * Cold-chain transit tracking: a collector opens a box, adds the vials they
 * collect, logs temperatures (typed or from a data logger) and closes the box
 * at handover. Excursions are flagged to the lab and travel with each vial.
 */
@Injectable()
export class PartnerColdChainService {
  constructor(
    @InjectModel(ColdChainRun.name)
    private readonly runModel: Model<ColdChainRunDocument>,
    @InjectModel(PartnerLabOrder.name)
    private readonly orderModel: Model<LabOrderDocument>,
    private readonly notifier: PartnerNotifierService,
    private readonly audit: AuditLogService,
    private readonly live: LiveBus,
  ) {}

  async list(actor: PartnerActor, q: ColdChainQueryDto) {
    const runs = await this.runModel
      .find({
        providerId: actor.provider._id,
        ...(q.status && { status: q.status }),
      })
      .sort({ startedAt: -1 })
      .limit(100)
      .exec();
    return runs.map((r) => this.view(r));
  }

  async create(actor: PartnerActor, dto: CreateColdChainRunDto) {
    const preset = RANGE_PRESETS[dto.preset as RangePreset];
    const run = await this.runModel.create({
      providerId: actor.provider._id,
      boxLabel: dto.boxLabel.trim(),
      preset: dto.preset,
      minC: preset.minC,
      maxC: preset.maxC,
      carrierMemberId: actor.member._id,
      carrierName: actor.member.fullName,
      startedAt: new Date(),
      status: 'open',
    });
    await this.record(actor, run, `${run.boxLabel} opened (${preset.label})`);
    return this.view(run);
  }

  async addVial(actor: PartnerActor, id: string, rawBarcode: string) {
    const run = await this.openRun(actor, id);
    const barcode = rawBarcode.trim().toUpperCase();
    if (run.vials.some((v) => v.barcode === barcode)) return this.view(run);
    if (run.vials.length >= MAX_VIALS)
      throw new BadRequestException(`A box holds up to ${MAX_VIALS} vials`);
    const order = await this.orderModel
      .findOne({ providerId: actor.provider._id, 'samples.barcode': barcode })
      .select('orderNo patientName')
      .exec();
    if (!order)
      throw new BadRequestException(
        'This vial isn’t linked to any order — label or link it first',
      );
    const elsewhere = await this.runModel
      .findOne({
        providerId: actor.provider._id,
        _id: { $ne: run._id },
        'vials.barcode': barcode,
      })
      .select('boxLabel')
      .lean()
      .exec();
    if (elsewhere)
      throw new BadRequestException(
        `This vial is already logged in ${elsewhere.boxLabel}`,
      );
    run.vials.push({
      barcode,
      orderId: order._id,
      orderNo: order.orderNo,
      patientName: order.patientName,
      addedAt: new Date(),
    });
    await run.save();
    return this.view(run);
  }

  async removeVial(actor: PartnerActor, id: string, barcode: string) {
    const run = await this.openRun(actor, id);
    run.set(
      'vials',
      run.vials.filter((v) => v.barcode !== barcode.trim().toUpperCase()),
    );
    await run.save();
    return this.view(run);
  }

  async addReadings(actor: PartnerActor, id: string, dto: AddReadingsDto) {
    const run = await this.openRun(actor, id);
    const now = Date.now();
    const readings = dto.readings.map((r) => {
      const at = r.at ? new Date(r.at) : new Date();
      if (at.getTime() > now + 5 * 60_000)
        throw new BadRequestException('A reading can’t be in the future');
      return {
        at,
        tempC: Math.round(r.tempC * 10) / 10,
        source: 'manual',
        byName: actor.member.fullName,
      };
    });
    this.append(run, readings);
    await run.save();
    await this.flagExcursion(actor, run);
    return this.view(run);
  }

  async uploadLogger(actor: PartnerActor, id: string, dto: LoggerUploadDto) {
    const run = await this.openRun(actor, id);
    const { readings, skipped } = parseLoggerCsv(dto.csv);
    if (!readings.length)
      throw new BadRequestException(
        'No readings found — the file should have a time and a temperature on each line',
      );
    const known = new Set(run.readings.map((r) => r.at.getTime()));
    const fresh = readings
      .filter(
        (r) => r.tempC >= -90 && r.tempC <= 60 && !known.has(r.at.getTime()),
      )
      .map((r) => ({
        at: r.at,
        tempC: Math.round(r.tempC * 10) / 10,
        source: 'logger',
        byName: actor.member.fullName,
      }));
    this.append(run, fresh);
    await run.save();
    await this.record(
      actor,
      run,
      `${run.boxLabel}: ${fresh.length} logger readings imported`,
    );
    await this.flagExcursion(actor, run);
    return { run: this.view(run), imported: fresh.length, skipped };
  }

  /**
   * The moment a box's readings breach its range — not only at handover — the
   * lab is alerted once and the box shows on the supervisor's dashboard until
   * someone acknowledges it.
   */
  private async flagExcursion(actor: PartnerActor, run: ColdChainRunDocument) {
    if (run.excursionAlertedAt) return;
    const s = summarize(run.readings, run.minC, run.maxC, null);
    if (s.verdict !== 'excursion') return;
    run.excursionAlertedAt = new Date();
    await run.save();
    const range = rangeLabel(run);
    await this.record(
      actor,
      run,
      `${run.boxLabel}: excursion in transit — ${s.minutesOut} min outside ${range}`,
    );
    await this.notifier.emit(actor.provider._id, {
      trigger: PartnerTrigger.COLD_CHAIN_EXCURSION,
      title: `Cold-chain excursion in transit — ${run.boxLabel}`,
      message: `${run.boxLabel} has gone outside ${range} (max ${s.maxC} °C, min ${s.minC} °C, ${s.minutesOut} min so far) with ${run.vials.length} vial${run.vials.length === 1 ? '' : 's'} on board. Check the box and its samples.`,
      safeMessage: `A transport box (${run.boxLabel}) is outside its temperature range — check it in the Ayuva Partner Portal.`,
      route: '/partner/lab/cold-chain',
      data: { runId: run.id, minutesOut: s.minutesOut, inTransit: true },
    });
  }

  /** The supervisor's acknowledgement of an excursion flag, with what was done. */
  async acknowledge(actor: PartnerActor, id: string, note?: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Transport box not found');
    const run = await this.runModel
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!run) throw new NotFoundException('Transport box not found');
    if (!run.excursionAlertedAt)
      throw new BadRequestException('This box has no excursion to acknowledge');
    run.excursionAckAt = new Date();
    run.excursionAckByName = actor.member.fullName;
    run.excursionAckNote = note?.trim() || undefined;
    await run.save();
    await this.record(
      actor,
      run,
      `${run.boxLabel}: excursion acknowledged${run.excursionAckNote ? ` — ${run.excursionAckNote}` : ''}`,
    );
    return this.view(run);
  }

  /** Excursions nobody has acknowledged yet, for the dashboard's emergency flag. */
  async alerts(providerId: Types.ObjectId) {
    const runs = await this.runModel
      .find({
        providerId,
        excursionAlertedAt: { $exists: true },
        excursionAckAt: { $exists: false },
      })
      .sort({ excursionAlertedAt: -1 })
      .limit(20)
      .exec();
    return runs.map((r) => {
      const s = summarize(r.readings, r.minC, r.maxC, r.endedAt ?? null);
      return {
        id: r.id,
        boxLabel: r.boxLabel,
        rangeLabel: rangeLabel(r),
        status: r.status,
        minutesOut: s.minutesOut,
        maxC: s.maxC,
        minC: s.minC,
        vials: r.vials.length,
        alertedAt: r.excursionAlertedAt!.toISOString(),
      };
    });
  }

  /** Handover at the lab: the verdict is fixed and an excursion is flagged on every affected order. */
  async close(actor: PartnerActor, id: string) {
    const run = await this.openRun(actor, id);
    const now = new Date();
    const s = summarize(run.readings, run.minC, run.maxC, now);
    run.status = 'closed';
    run.endedAt = now;
    run.closedByName = actor.member.fullName;
    run.verdict = s.verdict;
    run.minutesOut = s.minutesOut;
    await run.save();
    const range = rangeLabel(run);
    await this.record(
      actor,
      run,
      `${run.boxLabel} handed over — ${s.verdict === 'excursion' ? `excursion, ${s.minutesOut} min outside ${range}` : s.verdict === 'ok' ? `within ${range}` : 'no temperature readings'}`,
    );
    if (s.verdict === 'excursion' && run.vials.length) {
      const orderIds = [...new Set(run.vials.map((v) => v.orderId.toString()))];
      const orders = await this.orderModel
        .find({ _id: { $in: orderIds } })
        .exec();
      for (const o of orders) {
        o.statusHistory.push({
          at: now,
          status: o.status,
          byName: actor.member.fullName,
          note: `Cold-chain excursion in transit (${run.boxLabel}): ${s.minutesOut} min outside ${range}, max ${s.maxC} °C / min ${s.minC} °C — review before analysis`,
        });
        await o.save();
      }
      // Alerted once: a box already flagged in transit isn't announced again at handover.
      if (!run.excursionAlertedAt)
        await this.notifier.emit(actor.provider._id, {
          trigger: PartnerTrigger.COLD_CHAIN_EXCURSION,
          title: `Cold-chain excursion — ${run.boxLabel}`,
          message: `${run.vials.length} vial${run.vials.length === 1 ? '' : 's'} spent ${s.minutesOut} min outside ${range} (max ${s.maxC} °C, min ${s.minC} °C). Review them at reception before analysis.`,
          safeMessage: `A transport box (${run.boxLabel}) had a temperature excursion — review its samples in the Ayuva Partner Portal.`,
          route: '/partner/lab/cold-chain',
          data: {
            runId: run.id,
            vials: run.vials.length,
            minutesOut: s.minutesOut,
          },
          excludeUserId: actor.userId,
        });
    }
    if (s.verdict === 'excursion' && !run.excursionAlertedAt) {
      run.excursionAlertedAt = now;
      await run.save();
    }
    return this.view(run);
  }

  /** Transit status for vials, by barcode (reception and the vial board use this). */
  async vialTransit(
    providerId: Types.ObjectId,
    barcodes: string[],
  ): Promise<Map<string, VialTransit>> {
    const out = new Map<string, VialTransit>();
    if (!barcodes.length) return out;
    const runs = await this.runModel
      .find({ providerId, 'vials.barcode': { $in: barcodes } })
      .exec();
    for (const run of runs) {
      const s =
        run.status === 'closed'
          ? {
              verdict: run.verdict ?? 'no_data',
              minutesOut: run.minutesOut ?? 0,
            }
          : summarize(run.readings, run.minC, run.maxC);
      for (const v of run.vials)
        if (barcodes.includes(v.barcode))
          out.set(v.barcode, {
            runId: run.id,
            boxLabel: run.boxLabel,
            rangeLabel: rangeLabel(run),
            status: run.status,
            verdict: s.verdict,
            minutesOut: s.minutesOut,
          });
    }
    return out;
  }

  private append(
    run: ColdChainRunDocument,
    readings: { at: Date; tempC: number; source: string; byName: string }[],
  ) {
    if (run.readings.length + readings.length > MAX_READINGS)
      throw new BadRequestException(
        `A box keeps up to ${MAX_READINGS} readings`,
      );
    run.readings.push(...readings);
    run.readings.sort((a, b) => a.at.getTime() - b.at.getTime());
    run.markModified('readings');
  }

  private async openRun(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Transport box not found');
    const run = await this.runModel
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!run) throw new NotFoundException('Transport box not found');
    if (run.status !== 'open')
      throw new BadRequestException('This box has already been handed over');
    return run;
  }

  private record(
    actor: PartnerActor,
    run: ColdChainRunDocument,
    label: string,
  ) {
    this.live.publish(actor.provider._id, 'lab');
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_COLD_CHAIN,
      targetType: 'ColdChainRun',
      targetId: run.id,
      metadata: { providerId: actor.provider.id, label },
      ipAddress: actor.ip,
    });
  }

  private view(r: ColdChainRunDocument) {
    const s = summarize(r.readings, r.minC, r.maxC, r.endedAt ?? null);
    return {
      id: r.id,
      boxLabel: r.boxLabel,
      preset: r.preset,
      rangeLabel: rangeLabel(r),
      minC: r.minC,
      maxC: r.maxC,
      carrierName: r.carrierName,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt?.toISOString() ?? null,
      closedByName: r.closedByName ?? null,
      status: r.status as 'open' | 'closed',
      verdict: s.verdict,
      excursion: r.excursionAlertedAt
        ? {
            alertedAt: r.excursionAlertedAt.toISOString(),
            acknowledgedAt: r.excursionAckAt?.toISOString() ?? null,
            acknowledgedByName: r.excursionAckByName ?? null,
            note: r.excursionAckNote ?? null,
          }
        : null,
      summary: {
        readings: s.readings,
        minC: s.minC,
        maxC: s.maxC,
        outOfRange: s.outOfRange,
        minutesOut: s.minutesOut,
        firstOutAt: s.firstOutAt?.toISOString() ?? null,
      },
      readings: r.readings.map((x) => ({
        at: x.at.toISOString(),
        tempC: x.tempC,
        source: x.source,
        byName: x.byName ?? null,
      })),
      vials: r.vials.map((v) => ({
        barcode: v.barcode,
        orderId: v.orderId.toString(),
        orderNo: v.orderNo,
        patientName: v.patientName,
        addedAt: v.addedAt.toISOString(),
      })),
    };
  }
}

function rangeLabel(r: { minC: number; maxC: number; preset: string }) {
  return (
    RANGE_PRESETS[r.preset as RangePreset]?.label.replace(/^\w+ /, '') ??
    `${r.minC}–${r.maxC} °C`
  );
}
