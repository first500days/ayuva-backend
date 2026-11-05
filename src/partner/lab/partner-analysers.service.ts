import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/schemas/audit-log.schema';
import {
  Provider,
  ProviderDocument,
} from '../../core/providers/schemas/provider.schema';
import { PartnerActor } from '../rbac/partner-perm.guard';
import { OrgType, StaffRole } from '../rbac/partner-permissions';
import {
  LabOrderDocument,
  LabOrderStatus,
  PartnerLabOrder,
} from './schemas/lab-order.schema';
import {
  AnalyserMessage,
  AnalyserMessageDocument,
  LabAnalyser,
  LabAnalyserDocument,
} from './schemas/analyser.schema';
import { PartnerLabResultsService } from './partner-lab-results.service';
import {
  InstrumentSpecimen,
  hl7Ack,
  parseInstrumentMessage,
} from './instrument-messages';
import { CreateAnalyserDto, UpdateAnalyserDto } from './dto/analyser.dto';

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Analyser interfacing (LIS): instruments send HL7 or ASTM results through
 * the on-site bridge, which posts them here with the analyser's key. Each
 * result fills the matching blank value on the order its vial belongs to,
 * through the same save path as typed results — so flags, delta and
 * contamination checks and critical-value alerts all apply. Values a person
 * already entered are never overwritten.
 */
@Injectable()
export class PartnerAnalysersService {
  constructor(
    @InjectModel(LabAnalyser.name)
    private readonly analyserModel: Model<LabAnalyserDocument>,
    @InjectModel(AnalyserMessage.name)
    private readonly messageModel: Model<AnalyserMessageDocument>,
    @InjectModel(PartnerLabOrder.name)
    private readonly orderModel: Model<LabOrderDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    private readonly results: PartnerLabResultsService,
    private readonly audit: AuditLogService,
  ) {}

  async list(actor: PartnerActor) {
    const rows = await this.analyserModel
      .find({ providerId: actor.provider._id })
      .sort({ active: -1, name: 1 })
      .exec();
    return rows.map((a) => this.view(a));
  }

  /** Registers an analyser and returns its bridge key — shown this once only. */
  async create(actor: PartnerActor, dto: CreateAnalyserDto) {
    const key = newKey();
    const a = await this.analyserModel.create({
      providerId: actor.provider._id,
      name: dto.name.trim(),
      protocol: dto.protocol,
      keyHash: hashKey(key),
      keyHint: key.slice(-4),
      codes: cleanCodes(dto.codes ?? []),
      createdByUserId: new Types.ObjectId(actor.userId),
    });
    await this.record(
      actor,
      a,
      `Analyser added: ${a.name} (${a.protocol.toUpperCase()})`,
    );
    return { analyser: this.view(a), key };
  }

  async update(actor: PartnerActor, id: string, dto: UpdateAnalyserDto) {
    const a = await this.load(actor, id);
    if (dto.name !== undefined) a.name = dto.name.trim();
    if (dto.codes !== undefined) a.set('codes', cleanCodes(dto.codes));
    if (dto.active !== undefined) a.active = dto.active;
    await a.save();
    await this.record(
      actor,
      a,
      `Analyser ${a.name} updated: ${a.codes.length} test codes mapped${a.active ? '' : ', switched off'}`,
    );
    return this.view(a);
  }

  async rotateKey(actor: PartnerActor, id: string) {
    const a = await this.load(actor, id);
    const key = newKey();
    a.keyHash = hashKey(key);
    a.keyHint = key.slice(-4);
    await a.save();
    await this.record(actor, a, `Analyser ${a.name}: bridge key replaced`);
    return { analyser: this.view(a), key };
  }

  async messages(actor: PartnerActor, id: string) {
    const a = await this.load(actor, id);
    const rows = await this.messageModel
      .find({ providerId: actor.provider._id, analyserId: a._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
    return rows.map((m) => ({
      id: m.id,
      at: (m.createdAt ?? new Date()).toISOString(),
      protocol: m.protocol,
      controlId: m.controlId ?? null,
      status: m.status,
      error: m.error ?? null,
      test: m.test,
      items: m.items.map((i) => ({
        barcode: i.barcode,
        orderNo: i.orderNo ?? null,
        applied: i.applied,
        unchanged: i.unchanged ?? 0,
        skipped: i.skipped,
      })),
      raw: m.raw.slice(0, 4000),
    }));
  }

  /** A message pasted in the portal goes through exactly what the bridge would trigger. */
  async testMessage(actor: PartnerActor, id: string, raw: string) {
    const a = await this.load(actor, id);
    return this.process(a, actor.provider, raw, true, actor.ip);
  }

  /** The bridge's endpoint: the analyser is identified by its key alone. */
  async ingest(key: string | undefined, raw: string, ip?: string) {
    if (!key) throw new UnauthorizedException('Missing analyser key');
    const a = await this.analyserModel
      .findOne({ keyHash: hashKey(key), active: true })
      .exec();
    if (!a) throw new UnauthorizedException('Unknown or switched-off analyser');
    const provider = await this.providerModel.findById(a.providerId).exec();
    if (!provider) throw new UnauthorizedException('Unknown organisation');
    return this.process(a, provider, raw, false, ip);
  }

  private async process(
    a: LabAnalyserDocument,
    provider: ProviderDocument,
    raw: string,
    test: boolean,
    ip?: string,
  ) {
    const protocol = a.protocol as 'hl7' | 'astm';
    let parsed;
    try {
      parsed = parseInstrumentMessage(protocol, raw);
    } catch (err) {
      const error = (err as Error).message;
      await this.messageModel.create({
        providerId: provider._id,
        analyserId: a._id,
        protocol,
        raw: raw.slice(0, 20_000),
        status: 'error',
        error,
        test,
      });
      return {
        status: 'error' as const,
        error,
        items: [],
        ack: protocol === 'hl7' ? hl7Ack(null, 'AE', error) : null,
      };
    }
    // Results are saved as the analyser, so alerts reach every person in the lab.
    const actor = {
      provider,
      member: {
        _id: a._id,
        id: a.id,
        fullName: `${a.name} (analyser)`,
      },
      orgType: OrgType.DIAGNOSTIC,
      role: StaffRole.TECHNICIAN,
      permissions: [],
      userId: a.id,
      ip,
    } as unknown as PartnerActor;
    const codeMap = new Map(
      a.codes.map((c) => [c.code.toUpperCase(), c.parameter]),
    );
    const items = [];
    for (const sp of parsed.specimens)
      items.push(await this.applySpecimen(actor, a, sp, codeMap));
    const applied = items.reduce((n, i) => n + i.applied, 0);
    const skipped = items.reduce((n, i) => n + i.skipped.length, 0);
    // A resent value that's already on the report counts as delivered.
    const landed = applied + items.reduce((n, i) => n + i.unchanged, 0);
    const status =
      landed && !skipped ? 'applied' : landed ? 'partial' : 'unmatched';
    await this.messageModel.create({
      providerId: provider._id,
      analyserId: a._id,
      protocol,
      controlId: parsed.controlId ?? undefined,
      raw: raw.slice(0, 20_000),
      status,
      items,
      test,
    });
    a.lastMessageAt = new Date();
    await a.save();
    return {
      status,
      error: null,
      items,
      ack:
        protocol === 'hl7'
          ? hl7Ack(
              parsed.controlId,
              'AA',
              `Applied ${applied} result${applied === 1 ? '' : 's'}`,
            )
          : null,
    };
  }

  private async applySpecimen(
    actor: PartnerActor,
    a: LabAnalyserDocument,
    sp: InstrumentSpecimen,
    codeMap: Map<string, string>,
  ) {
    const barcode = sp.barcode.trim().toUpperCase();
    const item = {
      barcode,
      orderNo: undefined as string | undefined,
      applied: 0,
      unchanged: 0,
      skipped: [] as string[],
    };
    const order = await this.orderModel
      .findOne({ providerId: actor.provider._id, 'samples.barcode': barcode })
      .exec();
    if (!order) {
      item.skipped.push('no order has this vial');
      return item;
    }
    item.orderNo = order.orderNo;
    if (
      order.status === LabOrderStatus.DELIVERED ||
      order.status === LabOrderStatus.CANCELLED
    ) {
      item.skipped.push('the order is closed');
      return item;
    }
    const current = await this.results.get(actor, order.id);
    if (current.status === 'released') {
      item.skipped.push('the report is already released');
      return item;
    }
    const slots = current.tests.flatMap((t) => t.values);
    const filled: string[] = [];
    for (const r of sp.results) {
      const target = codeMap.get(r.code.toUpperCase()) ?? r.name ?? r.code;
      const slot = slots.find((v) => norm(v.name) === norm(target));
      if (!slot) {
        item.skipped.push(`${r.code}: no matching parameter on this order`);
        continue;
      }
      const existing = (slot.value ?? '').trim();
      if (existing === r.value) {
        item.unchanged += 1;
        continue;
      }
      if (existing) {
        item.skipped.push(`${r.code}: already entered as ${existing}`);
        continue;
      }
      slot.value = r.value;
      filled.push(`${slot.name} ${r.value}${r.unit ? ` ${r.unit}` : ''}`);
    }
    if (filled.length) {
      await this.results.save(actor, order.id, {
        tests: current.tests as never,
        comments: current.comments,
      });
      item.applied = filled.length;
      await this.audit.record({
        actorId: a.createdByUserId.toString(),
        action: AuditAction.PARTNER_LAB_ANALYSER,
        targetType: 'PartnerLabOrder',
        targetId: order.id,
        metadata: {
          providerId: actor.provider.id,
          patientId: order.patientId.toString(),
          label: `${order.orderNo} · via ${a.name}: ${filled.slice(0, 4).join(', ')}${filled.length > 4 ? '…' : ''}`,
          analyserId: a.id,
          count: filled.length,
        },
      });
    }
    return item;
  }

  private async load(actor: PartnerActor, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Analyser not found');
    const a = await this.analyserModel
      .findOne({ _id: id, providerId: actor.provider._id })
      .exec();
    if (!a) throw new NotFoundException('Analyser not found');
    return a;
  }

  private record(actor: PartnerActor, a: LabAnalyserDocument, label: string) {
    return this.audit.record({
      actorId: actor.userId,
      action: AuditAction.PARTNER_LAB_ANALYSER,
      targetType: 'LabAnalyser',
      targetId: a.id,
      metadata: { providerId: actor.provider.id, label },
      ipAddress: actor.ip,
    });
  }

  private view(a: LabAnalyserDocument) {
    return {
      id: a.id,
      name: a.name,
      protocol: a.protocol as 'hl7' | 'astm',
      keyHint: a.keyHint,
      codes: a.codes.map((c) => ({ code: c.code, parameter: c.parameter })),
      active: a.active,
      lastMessageAt: a.lastMessageAt?.toISOString() ?? null,
    };
  }
}

function newKey() {
  return `ayk_${randomBytes(24).toString('base64url')}`;
}

function cleanCodes(codes: { code: string; parameter: string }[]) {
  const seen = new Set<string>();
  return codes
    .map((c) => ({
      code: c.code.trim().toUpperCase(),
      parameter: c.parameter.trim(),
    }))
    .filter(
      (c) => c.code && c.parameter && !seen.has(c.code) && seen.add(c.code),
    );
}
