import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model } from 'mongoose';
import { AuditLogService } from '../../../audit-log/audit-log.service';
import { AuditAction } from '../../../audit-log/schemas/audit-log.schema';
import {
  HealthProfile,
  HealthProfileDocument,
} from '../../../core/health-profile/schemas/health-profile.schema';
import {
  Provider,
  ProviderDocument,
} from '../../../core/providers/schemas/provider.schema';
import type { PartnerActor } from '../../rbac/partner-perm.guard';
import { OrgType, StaffRole } from '../../rbac/partner-permissions';
import {
  AnalyserMessage,
  AnalyserMessageDocument,
  LabAnalyser,
  LabAnalyserDocument,
} from '../schemas/analyser.schema';
import {
  LabOrderDocument,
  LabOrderStatus,
  PartnerLabOrder,
} from '../schemas/lab-order.schema';
import { PartnerLabOrdersService } from '../partner-lab-orders.service';
import type { MultipartPart } from './multipart-related';
import {
  FAILURE,
  checkPatient,
  dicomDate,
  readPushedHeader,
  type PushedHeader,
  type StowOutcome,
} from './stow-checks';

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

interface Item {
  barcode: string;
  orderNo?: string;
  applied: number;
  unchanged: number;
  skipped: string[];
}

type Pushed = { header: PushedHeader; body: Buffer };

/**
 * Images pushed straight from scanners or a PACS (DICOMweb STOW-RS), through
 * an on-site gateway such as Orthanc that holds the lab's gateway key. Each
 * image goes to the lab order whose number is in its Accession Number, and
 * only when the patient on the scan is the patient on the order.
 */
@Injectable()
export class PartnerStowService {
  /** One order at a time, so two batches for the same study can't overwrite each other. */
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    @InjectModel(LabAnalyser.name)
    private readonly analyserModel: Model<LabAnalyserDocument>,
    @InjectModel(AnalyserMessage.name)
    private readonly messageModel: Model<AnalyserMessageDocument>,
    @InjectModel(PartnerLabOrder.name)
    private readonly orderModel: Model<LabOrderDocument>,
    @InjectModel(Provider.name)
    private readonly providerModel: Model<ProviderDocument>,
    @InjectModel(HealthProfile.name)
    private readonly profileModel: Model<HealthProfileDocument>,
    private readonly orders: PartnerLabOrdersService,
    private readonly audit: AuditLogService,
  ) {}

  /** The gateway a key belongs to. Checked before the body is read. */
  async gateway(key: string | undefined) {
    if (!key) throw new UnauthorizedException('Missing gateway key');
    const a = await this.analyserModel
      .findOne({ keyHash: hashKey(key), active: true, protocol: 'dicomweb' })
      .exec();
    if (!a) throw new UnauthorizedException('Unknown or switched-off gateway');
    const provider = await this.providerModel.findById(a.providerId).exec();
    if (!provider) throw new UnauthorizedException('Unknown organisation');
    return { a, provider };
  }

  async store(
    gateway: { a: LabAnalyserDocument; provider: ProviderDocument },
    parts: MultipartPart[],
    ip?: string,
  ): Promise<StowOutcome> {
    const { a, provider } = gateway;
    const outcome: StowOutcome = { stored: [], failed: [] };
    const groups = new Map<string, Pushed[]>();
    const items: Item[] = [];
    const unreadable: Item = { barcode: '(unreadable)', applied: 0, unchanged: 0, skipped: [] };
    const noAccession: Item = { barcode: '(no accession number)', applied: 0, unchanged: 0, skipped: [] };

    for (const part of parts) {
      const header = readPushedHeader(part.body);
      if (!header) {
        outcome.failed.push({ sopClassUid: null, sopInstanceUid: null, reason: FAILURE.CANNOT_UNDERSTAND });
        unreadable.skipped.push('not a DICOM file');
        continue;
      }
      if (!header.accession) {
        outcome.failed.push({ ...uids(header), reason: FAILURE.PROCESSING });
        noAccession.skipped.push('no accession number to match an order');
        continue;
      }
      const key = header.accession.trim().toUpperCase();
      groups.set(key, [...(groups.get(key) ?? []), { header, body: part.body }]);
    }

    const actor = {
      provider,
      member: { _id: a._id, id: a.id, fullName: `${a.name} (gateway)` },
      orgType: OrgType.DIAGNOSTIC,
      role: StaffRole.TECHNICIAN,
      permissions: [],
      userId: a.id,
      ip,
    } as unknown as PartnerActor;

    for (const [accession, list] of groups)
      items.push(
        await this.serialised(`${provider.id}:${accession}`, () =>
          this.attach(actor, a, accession, list, outcome),
        ),
      );
    for (const extra of [unreadable, noAccession])
      if (extra.skipped.length)
        items.push({ ...extra, skipped: collapse(extra.skipped) });

    const stored = outcome.stored.length;
    await this.messageModel.create({
      providerId: provider._id,
      analyserId: a._id,
      protocol: 'dicomweb',
      // Counts and order numbers only: no patient details in the log.
      raw: `STOW-RS: ${parts.length} image${parts.length === 1 ? '' : 's'} received, ${stored} kept. Accession numbers: ${[...groups.keys()].join(', ') || 'none'}.`,
      status: !parts.length
        ? 'error'
        : !outcome.failed.length
          ? 'applied'
          : stored
            ? 'partial'
            : 'unmatched',
      ...(!parts.length && { error: 'The request held no images' }),
      items,
      test: false,
    });
    a.lastMessageAt = new Date();
    await a.save();
    return outcome;
  }

  private async attach(
    actor: PartnerActor,
    a: LabAnalyserDocument,
    accession: string,
    list: Pushed[],
    outcome: StowOutcome,
  ): Promise<Item> {
    const item: Item = { barcode: accession, applied: 0, unchanged: 0, skipped: [] };
    const fail = (p: Pushed, reason: string) => {
      outcome.failed.push({ ...uids(p.header), reason: FAILURE.PROCESSING });
      item.skipped.push(reason);
    };
    const order = await this.orderModel
      .findOne({ providerId: actor.provider._id, orderNo: accession })
      .exec();
    if (!order || order.status === LabOrderStatus.CANCELLED) {
      list.forEach((p) => fail(p, 'no open order has this number'));
      item.skipped = collapse(item.skipped);
      return item;
    }
    item.orderNo = order.orderNo;

    const profile = await this.profileModel
      .findOne({ userId: order.patientId })
      .select('dateOfBirth')
      .lean()
      .exec();
    const orderPatient = {
      name: order.patientName,
      birthDate: dicomDate(profile?.dateOfBirth ?? null),
    };
    const matched: Pushed[] = [];
    for (const p of list) {
      const check = checkPatient(
        { name: p.header.patientName, birthDate: p.header.birthDate },
        orderPatient,
      );
      if (check === 'match') matched.push(p);
      else
        fail(
          p,
          check === 'mismatch'
            ? 'the patient on the scan is not the patient on this order: check the accession number at the scanner'
            : 'the scan does not name the patient clearly enough to check: correct it at the scanner',
        );
    }

    if (matched.length) {
      const results = await this.orders.attachPushed(
        actor,
        order,
        matched.map(
          (p) =>
            ({
              buffer: p.body,
              size: p.body.length,
              originalname: `${p.header.sopInstanceUid ?? 'image'}.dcm`,
            }) as Express.Multer.File,
        ),
      );
      results.forEach((reason, i) => {
        const p = matched[i]!;
        if (reason === null) {
          item.applied += 1;
          outcome.stored.push(uids(p.header));
        } else if (reason === 'already attached') {
          item.unchanged += 1;
          outcome.stored.push(uids(p.header));
        } else fail(p, reason);
      });
    }

    if (item.applied)
      await this.audit.record({
        actorId: a.createdByUserId.toString(),
        action: AuditAction.PARTNER_LAB_ANALYSER,
        targetType: 'PartnerLabOrder',
        targetId: order.id,
        metadata: {
          providerId: actor.provider.id,
          patientId: order.patientId.toString(),
          label: `${order.orderNo} · ${item.applied} image${item.applied === 1 ? '' : 's'} received from ${a.name}`,
          analyserId: a.id,
          count: item.applied,
        },
        ipAddress: actor.ip,
      });
    item.skipped = collapse(item.skipped);
    return item;
  }

  private async serialised<T>(key: string, work: () => Promise<T>): Promise<T> {
    const before = this.locks.get(key) ?? Promise.resolve();
    const run = before.catch(() => undefined).then(work);
    this.locks.set(key, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(key) === run) this.locks.delete(key);
    }
  }
}

const uids = (h: PushedHeader) => ({
  sopClassUid: h.sopClassUid,
  sopInstanceUid: h.sopInstanceUid,
});

/** "no open order has this number (×120)" rather than 120 identical lines. */
function collapse(reasons: string[]): string[] {
  const counts = new Map<string, number>();
  reasons.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  return [...counts].map(([r, n]) => (n > 1 ? `${r} (×${n})` : r));
}

