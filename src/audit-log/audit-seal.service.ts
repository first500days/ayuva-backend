import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import {
  AccessLog,
  AccessLogDocument,
} from '../core/sharing/schemas/access-log.schema';
import { GENESIS, digestRows, sealHash } from './audit-seal';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { AuditSeal, AuditSealDocument } from './schemas/audit-seal.schema';

const SEAL_EVERY_MS = 5 * 60_000;
// Rows younger than this might still be arriving out of order.
const SETTLE_MS = 60_000;
const BATCH = 5000;
const MAX_BATCHES_PER_RUN = 20;
const ZERO_ID = new Types.ObjectId('000000000000000000000000');
const MONGO_DUPLICATE_KEY_ERROR = 11000;

type Row = Record<string, unknown> & { _id: Types.ObjectId };
type RowModel = Model<AuditLogDocument> | Model<AccessLogDocument>;

export interface SealProblem {
  source: string;
  seq: number;
  /** What was found: rows changed, rows missing or added, or a broken chain. */
  reason: 'rows_changed' | 'row_count_changed' | 'seal_altered' | 'chain_broken';
  /** The period the damaged batch covers. */
  from: string;
  to: string;
}

export interface SealVerification {
  ok: boolean;
  checkedAt: string;
  sealsChecked: number;
  rowsChecked: number;
  rowsNotYetSealed: number;
  lastSealedAt: string | null;
  problems: SealProblem[];
}

/**
 * Tamper evidence for the audit trail. Every few minutes new rows are sealed
 * in a keyed hash chain. Anyone editing the database directly can't produce a
 * matching seal without the key, so a later verification shows what changed.
 * Each seal's hash also goes to the application log, outside the database.
 */
@Injectable()
export class AuditSealService {
  private readonly logger = new Logger(AuditSealService.name);
  private running = false;

  constructor(
    @InjectModel(AuditSeal.name)
    private readonly seals: Model<AuditSealDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    @InjectModel(AccessLog.name)
    private readonly accessModel: Model<AccessLogDocument>,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return (
      this.config.get<string>('audit.sealSecret') ||
      `${this.config.get<string>('jwt.accessSecret')}:audit-seal`
    );
  }

  private get sources(): { source: string; model: RowModel; field: string }[] {
    return [
      { source: 'audit', model: this.auditModel, field: 'createdAt' },
      { source: 'access', model: this.accessModel, field: 'occurredAt' },
    ];
  }

  @Interval(SEAL_EVERY_MS)
  async sealNew(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const s of this.sources) {
        for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
          if (!(await this.sealBatch(s.source, s.model, s.field))) break;
        }
      }
    } catch (err) {
      this.logger.error('Sealing audit logs failed', err as Error);
    } finally {
      this.running = false;
    }
  }

  private rowsBetween(
    model: RowModel,
    filter: Record<string, unknown>,
    limit?: number,
  ): Promise<Row[]> {
    const q = (model as Model<AuditLogDocument>)
      .find(filter)
      .sort({ _id: 1 });
    if (limit) q.limit(limit);
    return q.lean().exec() as unknown as Promise<Row[]>;
  }

  /** Seals the next batch. False when there's nothing (more) to seal. */
  private async sealBatch(
    source: string,
    model: RowModel,
    field: string,
  ): Promise<boolean> {
    const last = await this.seals
      .findOne({ source })
      .sort({ seq: -1 })
      .lean()
      .exec();
    const fromId = last?.toId ?? ZERO_ID;
    const rows = await this.rowsBetween(
      model,
      {
        _id: { $gt: fromId },
        [field]: { $lt: new Date(Date.now() - SETTLE_MS) },
      },
      BATCH,
    );
    if (!rows.length) return false;
    const fields = {
      source,
      seq: (last?.seq ?? 0) + 1,
      fromId: fromId.toString(),
      toId: rows[rows.length - 1]._id.toString(),
      count: rows.length,
      rowsDigest: digestRows(rows),
      prevHash: last?.hash ?? GENESIS,
    };
    const hash = sealHash(this.secret, fields);
    try {
      await this.seals.create({
        ...fields,
        fromId: new Types.ObjectId(fields.fromId),
        toId: new Types.ObjectId(fields.toId),
        hash,
      });
    } catch (err) {
      // Another server instance sealed this batch first.
      if ((err as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR)
        return false;
      throw err;
    }
    this.logger.log(
      `Audit seal ${source}#${fields.seq}: ${fields.count} rows, hash ${hash}`,
    );
    return rows.length === BATCH;
  }

  /** Re-reads every sealed row and reports the first damage in each log. */
  async verify(): Promise<SealVerification> {
    let sealsChecked = 0;
    let rowsChecked = 0;
    let rowsNotYetSealed = 0;
    let lastSealedAt: Date | null = null;
    const problems: SealProblem[] = [];

    for (const { source, model } of this.sources) {
      const seals = await this.seals
        .find({ source })
        .sort({ seq: 1 })
        .lean()
        .exec();
      let prevHash = GENESIS;
      let prevTo = ZERO_ID;
      let expectedSeq = 1;
      let damaged = false;
      for (const seal of seals) {
        sealsChecked += 1;
        if (seal.sealedAt && (!lastSealedAt || seal.sealedAt > lastSealedAt))
          lastSealedAt = seal.sealedAt;
        const rows = await this.rowsBetween(model, {
          _id: { $gt: seal.fromId, $lte: seal.toId },
        });
        rowsChecked += rows.length;
        if (damaged) continue;
        const reason = this.checkSeal(seal, rows, prevHash, prevTo, expectedSeq);
        if (reason) {
          damaged = true;
          problems.push({
            source,
            seq: seal.seq,
            reason,
            from: seal.fromId.getTimestamp().toISOString(),
            to: seal.toId.getTimestamp().toISOString(),
          });
        }
        prevHash = seal.hash;
        prevTo = seal.toId;
        expectedSeq = seal.seq + 1;
      }
      rowsNotYetSealed += await (model as Model<AuditLogDocument>)
        .countDocuments({ _id: { $gt: prevTo } })
        .exec();
    }
    return {
      ok: problems.length === 0,
      checkedAt: new Date().toISOString(),
      sealsChecked,
      rowsChecked,
      rowsNotYetSealed,
      lastSealedAt: lastSealedAt?.toISOString() ?? null,
      problems,
    };
  }

  private checkSeal(
    seal: AuditSeal,
    rows: Row[],
    prevHash: string,
    prevTo: Types.ObjectId,
    expectedSeq: number,
  ): SealProblem['reason'] | null {
    if (
      seal.seq !== expectedSeq ||
      seal.prevHash !== prevHash ||
      !seal.fromId.equals(prevTo)
    )
      return 'chain_broken';
    const expected = sealHash(this.secret, {
      source: seal.source,
      seq: seal.seq,
      fromId: seal.fromId.toString(),
      toId: seal.toId.toString(),
      count: seal.count,
      rowsDigest: seal.rowsDigest,
      prevHash: seal.prevHash,
    });
    if (expected !== seal.hash) return 'seal_altered';
    if (rows.length !== seal.count) return 'row_count_changed';
    return digestRows(rows) === seal.rowsDigest ? null : 'rows_changed';
  }
}
