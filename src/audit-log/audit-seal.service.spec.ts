import { ConfigService } from '@nestjs/config';
import mongoose, { Schema, Types } from 'mongoose';
import { APPEND_ONLY_MESSAGE, makeAppendOnly } from './append-only';
import { canonical } from './audit-seal';
import { AuditSealService } from './audit-seal.service';

/* Rows and seals live in memory; only the query shapes this service uses exist. */
function chainable(result: () => unknown) {
  const chain: any = {
    sort: () => chain,
    limit: () => chain,
    lean: () => chain,
    exec: async () => result(),
  };
  return chain;
}

const inRange = (id: Types.ObjectId, f: any) =>
  (!f?.$gt || id.toString() > f.$gt.toString()) &&
  (!f?.$lte || id.toString() <= f.$lte.toString());

function rowModel(field: string) {
  const rows: any[] = [];
  return {
    rows,
    add(extra: Record<string, unknown> = {}, ageMs = 10 * 60_000) {
      const row = {
        _id: new Types.ObjectId(),
        [field]: new Date(Date.now() - ageMs),
        action: 'login',
        metadata: { b: 1, a: new Types.ObjectId() },
        ...extra,
      };
      rows.push(row);
      return row;
    },
    find: (filter: any) =>
      chainable(() => {
        const limitAge = filter[field]?.$lt as Date | undefined;
        return rows
          .filter(
            (r) => inRange(r._id, filter._id) && (!limitAge || r[field] < limitAge),
          )
          .sort((a, b) => (a._id.toString() < b._id.toString() ? -1 : 1));
      }),
    countDocuments: (filter: any) =>
      chainable(() => rows.filter((r) => inRange(r._id, filter._id)).length),
  };
}

function sealModel() {
  const rows: any[] = [];
  return {
    rows,
    create: jest.fn(async (doc: any) => {
      if (rows.some((r) => r.source === doc.source && r.seq === doc.seq))
        throw Object.assign(new Error('dup'), { code: 11000 });
      rows.push({ ...doc, sealedAt: new Date() });
    }),
    findOne: ({ source }: any) =>
      chainable(
        () =>
          rows
            .filter((r) => r.source === source)
            .sort((a, b) => b.seq - a.seq)[0] ?? null,
      ),
    find: ({ source }: any) =>
      chainable(() =>
        rows.filter((r) => r.source === source).sort((a, b) => a.seq - b.seq),
      ),
  };
}

function build(secret = 'test-secret') {
  const audit = rowModel('createdAt');
  const access = rowModel('occurredAt');
  const seals = sealModel();
  const service = new AuditSealService(
    seals as never,
    audit as never,
    access as never,
    {
      get: (k: string) => (k === 'jwt.accessSecret' ? secret : undefined),
    } as unknown as ConfigService,
  );
  return { service, audit, access, seals };
}

describe('canonical', () => {
  it('ignores key order and treats ids and dates as text', () => {
    const id = new Types.ObjectId();
    const when = new Date('2026-01-01T00:00:00Z');
    expect(canonical({ b: 1, a: [id, when] })).toBe(
      canonical({ a: [id, when], b: 1 }),
    );
    expect(canonical({ a: id })).toBe(`{"a":"${id.toString()}"}`);
  });
});

describe('AuditSealService', () => {
  it('seals settled rows from both logs and verifies clean', async () => {
    const { service, audit, access, seals } = build();
    audit.add();
    audit.add();
    access.add();
    await service.sealNew();
    expect(seals.rows.map((s) => [s.source, s.count])).toEqual([
      ['audit', 2],
      ['access', 1],
    ]);
    await expect(service.verify()).resolves.toMatchObject({
      ok: true,
      sealsChecked: 2,
      rowsChecked: 3,
      rowsNotYetSealed: 0,
    });
  });

  it('leaves very recent rows for the next run, and still verifies', async () => {
    const { service, audit, seals } = build();
    audit.add();
    audit.add({}, 1000);
    await service.sealNew();
    expect(seals.rows[0].count).toBe(1);
    await expect(service.verify()).resolves.toMatchObject({
      ok: true,
      rowsNotYetSealed: 1,
    });
  });

  it('chains each batch to the one before', async () => {
    const { service, audit, seals } = build();
    audit.add();
    await service.sealNew();
    audit.add();
    await service.sealNew();
    expect(seals.rows.map((s) => s.seq)).toEqual([1, 2]);
    expect(seals.rows[1].prevHash).toBe(seals.rows[0].hash);
    expect(seals.rows[1].fromId).toEqual(seals.rows[0].toId);
    await expect(service.verify()).resolves.toMatchObject({ ok: true });
  });

  it('does nothing when there is nothing new', async () => {
    const { service, audit, seals } = build();
    audit.add();
    await service.sealNew();
    await service.sealNew();
    expect(seals.create).toHaveBeenCalledTimes(1);
  });

  it('catches a row edited in the database', async () => {
    const { service, audit } = build();
    const row = audit.add();
    audit.add();
    await service.sealNew();
    row.action = 'record_view';
    const result = await service.verify();
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatchObject({
      source: 'audit',
      seq: 1,
      reason: 'rows_changed',
    });
  });

  it('catches a row deleted from the database', async () => {
    const { service, audit } = build();
    audit.add();
    audit.add();
    await service.sealNew();
    audit.rows.shift();
    const result = await service.verify();
    expect(result.problems[0]?.reason).toBe('row_count_changed');
  });

  it('catches a row slipped into a sealed batch', async () => {
    const { service, audit } = build();
    const first = audit.add();
    audit.add();
    await service.sealNew();
    audit.rows.push({
      ...first,
      _id: new Types.ObjectId(first._id.toString().replace(/.$/, 'a')),
    });
    await expect(service.verify()).resolves.toMatchObject({ ok: false });
  });

  it('catches a seal rewritten without the key', async () => {
    const { service, audit, seals } = build();
    const row = audit.add();
    await service.sealNew();
    row.action = 'record_view';
    seals.rows[0].rowsDigest = 'attacker-recomputed-digest';
    const result = await service.verify();
    expect(result.problems[0]?.reason).toBe('seal_altered');
  });

  it('catches a seal removed from the chain', async () => {
    const { service, audit, seals } = build();
    audit.add();
    await service.sealNew();
    audit.add();
    await service.sealNew();
    seals.rows.shift();
    const result = await service.verify();
    expect(result.problems[0]?.reason).toBe('chain_broken');
  });

  it('lets only one server instance seal a batch', async () => {
    const { service, audit, seals } = build();
    audit.add();
    seals.create.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 11000 }),
    );
    await expect(service.sealNew()).resolves.toBeUndefined();
  });
});

describe('makeAppendOnly', () => {
  const schema = new Schema({ action: String });
  makeAppendOnly(schema);
  const Model = mongoose.model(`AppendOnlyTest${Date.now()}`, schema);

  it.each([
    ['updateOne', () => Model.updateOne({}, { action: 'x' }).exec()],
    ['updateMany', () => Model.updateMany({}, { action: 'x' }).exec()],
    ['replaceOne', () => Model.replaceOne({}, { action: 'x' }).exec()],
    ['findOneAndUpdate', () => Model.findOneAndUpdate({}, { action: 'x' }).exec()],
    ['findOneAndDelete', () => Model.findOneAndDelete({}).exec()],
    ['deleteOne', () => Model.deleteOne({}).exec()],
    ['deleteMany', () => Model.deleteMany({}).exec()],
  ])('refuses %s', async (_name, run) => {
    await expect(run()).rejects.toThrow(APPEND_ONLY_MESSAGE);
  });

  it('refuses saving an existing row, and deleting through a document', async () => {
    const doc = new Model({ action: 'a' });
    doc.isNew = false;
    await expect(doc.save()).rejects.toThrow(APPEND_ONLY_MESSAGE);
    await expect(doc.deleteOne()).rejects.toThrow(APPEND_ONLY_MESSAGE);
  });
});
