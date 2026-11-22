import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { LabOrderStatus } from '../schemas/lab-order.schema';
import { PartnerStowService } from './partner-stow.service';
import { dicomFile } from './test-dicom';

const KEY = 'ayk_gateway';
const PROVIDER = new Types.ObjectId();
const exec = (value: unknown) => ({ exec: async () => value });
const lean = (value: unknown) => ({
  select: () => ({ lean: () => ({ exec: async () => value }) }),
});

const scan = (o: Parameters<typeof dicomFile>[0]) => ({
  contentType: 'application/dicom',
  body: dicomFile({ accession: 'LAB-261108-AB12', patientName: 'KHAN^FARAH', ...o }),
});

function build(
  opts: {
    order?: Record<string, unknown> | null;
    dob?: Date;
    attach?: (n: number) => (string | null)[];
    analyser?: Record<string, unknown> | null;
  } = {},
) {
  const order =
    opts.order === null
      ? null
      : {
          id: 'o1',
          orderNo: 'LAB-261108-AB12',
          status: LabOrderStatus.PROCESSING,
          patientId: new Types.ObjectId(),
          patientName: 'Farah Khan',
          ...opts.order,
        };
  const analyser =
    opts.analyser === null
      ? null
      : {
          id: 'g1',
          _id: new Types.ObjectId(),
          name: 'CT gateway',
          protocol: 'dicomweb',
          createdByUserId: new Types.ObjectId(),
          save: jest.fn(async () => undefined),
          ...opts.analyser,
        };
  const analyserFind = jest.fn(() => exec(analyser));
  const orderFind = jest.fn(() => exec(order));
  const messages = { create: jest.fn(async () => undefined) };
  const audit = { record: jest.fn(async () => undefined) };
  const orders = {
    attachPushed: jest.fn(async (_a: unknown, _o: unknown, files: unknown[]) =>
      opts.attach ? opts.attach(files.length) : files.map(() => null),
    ),
  };
  const service = new PartnerStowService(
    { findOne: analyserFind } as never,
    messages as never,
    { findOne: orderFind } as never,
    { findById: () => exec({ _id: PROVIDER, id: PROVIDER.toString() }) } as never,
    { findOne: () => lean(opts.dob ? { dateOfBirth: opts.dob } : null) } as never,
    orders as never,
    audit as never,
  );
  return { service, analyserFind, orderFind, messages, audit, orders };
}

const run = async (t: ReturnType<typeof build>, parts: ReturnType<typeof scan>[]) =>
  t.service.store(await t.service.gateway(KEY), parts, '10.0.0.5');

describe('PartnerStowService', () => {
  it('only accepts a DICOM gateway key, by its hash', async () => {
    const t = build();
    await t.service.gateway(KEY);
    expect(t.analyserFind).toHaveBeenCalledWith({
      keyHash: createHash('sha256').update(KEY).digest('hex'),
      active: true,
      protocol: 'dicomweb',
    });
    await expect(t.service.gateway(undefined)).rejects.toThrow('Missing gateway key');
    await expect(build({ analyser: null }).service.gateway(KEY)).rejects.toThrow(
      'Unknown or switched-off gateway',
    );
  });

  it('attaches images to the order named by the accession number', async () => {
    const t = build();
    const out = await run(t, [scan({ sop: '9.1' }), scan({ sop: '9.2' })]);
    expect(out.stored.map((s) => s.sopInstanceUid)).toEqual(['9.1', '9.2']);
    expect(out.failed).toEqual([]);
    expect(t.orderFind).toHaveBeenCalledWith({
      providerId: PROVIDER,
      orderNo: 'LAB-261108-AB12',
    });
    expect(t.orders.attachPushed).toHaveBeenCalledTimes(1);
  });

  it('matches the accession number whatever its case or spacing', async () => {
    const t = build();
    await run(t, [scan({ accession: ' lab-261108-ab12 ' })]);
    expect(t.orderFind).toHaveBeenCalledWith(
      expect.objectContaining({ orderNo: 'LAB-261108-AB12' }),
    );
  });

  it('refuses a scan of a different patient instead of attaching it', async () => {
    const t = build();
    const out = await run(t, [scan({ patientName: 'SINGH^ARJUN' })]);
    expect(out.stored).toEqual([]);
    expect(out.failed[0]).toMatchObject({ reason: 0x0110 });
    expect(t.orders.attachPushed).not.toHaveBeenCalled();
    const logged = (t.messages.create.mock.calls[0] as unknown as [{ status: string; items: { skipped: string[] }[] }])[0];
    expect(logged.status).toBe('unmatched');
    expect(logged.items[0].skipped[0]).toContain('not the patient on this order');
  });

  it('refuses when the birth date disagrees with the patient profile', async () => {
    const t = build({ dob: new Date('1980-02-14T00:00:00Z') });
    const out = await run(t, [scan({ birthDate: '19900101' })]);
    expect(out.stored).toEqual([]);
  });

  it('holds back a scan with no patient name to check', async () => {
    const t = build();
    const out = await run(t, [scan({ patientName: '' })]);
    expect(out.stored).toEqual([]);
    expect(t.orders.attachPushed).not.toHaveBeenCalled();
  });

  it('reports images it cannot place, so the gateway shows them as failed', async () => {
    const out = await run(build({ order: null }), [scan({})]);
    expect(out.failed).toHaveLength(1);
    const cancelled = await run(build({ order: { status: LabOrderStatus.CANCELLED } }), [
      scan({}),
    ]);
    expect(cancelled.failed).toHaveLength(1);
  });

  it('turns away parts that are not DICOM, and images with no accession number', async () => {
    const t = build();
    const out = await run(t, [
      { contentType: 'text/plain', body: Buffer.from('hello') },
      scan({ accession: undefined }),
      { ...scan({}), body: dicomFile({ patientName: 'KHAN^FARAH' }) },
    ]);
    expect(out.failed.map((f) => f.reason)).toEqual([0xc000, 0x0110, 0x0110]);
    expect(out.stored).toEqual([]);
  });

  it('counts an image already on the order as stored, and passes on other refusals', async () => {
    const t = build({ attach: () => [null, 'already attached', 'over 60 MB'] });
    const out = await run(t, [scan({ sop: '1' }), scan({ sop: '2' }), scan({ sop: '3' })]);
    expect(out.stored.map((s) => s.sopInstanceUid)).toEqual(['1', '2']);
    expect(out.failed.map((f) => f.sopInstanceUid)).toEqual(['3']);
    const logged = (t.messages.create.mock.calls[0] as unknown as [{ status: string; items: { applied: number; unchanged: number }[] }])[0];
    expect(logged.status).toBe('partial');
    expect(logged.items[0]).toMatchObject({ applied: 1, unchanged: 1 });
  });

  it('audits what arrived without naming the patient anywhere it logs', async () => {
    const t = build();
    await run(t, [scan({})]);
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'partner_lab_analyser',
        metadata: expect.objectContaining({
          label: 'LAB-261108-AB12 · 1 image received from CT gateway',
        }),
        ipAddress: '10.0.0.5',
      }),
    );
    const everything = JSON.stringify([t.audit.record.mock.calls, t.messages.create.mock.calls]);
    expect(everything).not.toMatch(/khan|farah/i);
  });

  it('handles one batch for an order at a time', async () => {
    const order: Record<string, unknown> = {};
    let running = 0;
    let most = 0;
    const t = build({ order });
    t.orders.attachPushed.mockImplementation(async (_a, _o, files) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
      return files.map(() => null);
    });
    const gateway = await t.service.gateway(KEY);
    await Promise.all([
      t.service.store(gateway, [scan({ sop: '1' })]),
      t.service.store(gateway, [scan({ sop: '2' })]),
      t.service.store(gateway, [scan({ sop: '3' })]),
    ]);
    expect(most).toBe(1);
    expect(t.orders.attachPushed).toHaveBeenCalledTimes(3);
  });

  it('logs an empty request as an error', async () => {
    const t = build();
    const out = await run(t, []);
    expect(out).toEqual({ stored: [], failed: [] });
    expect(
      (t.messages.create.mock.calls[0] as unknown as [{ status: string }])[0].status,
    ).toBe('error');
  });
});
