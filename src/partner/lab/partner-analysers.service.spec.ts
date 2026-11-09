import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { LabOrderStatus } from './schemas/lab-order.schema';
import { PartnerAnalysersService } from './partner-analysers.service';

const KEY = 'ayk_test';
const PROVIDER = new Types.ObjectId();
const exec = (value: unknown) => ({ exec: async () => value });

const RIS_MESSAGE = (body: string[]) =>
  [
    'MSH|^~\\&|RIS|HOSP|AYUVA|LAB|20261108||ORU^R01|R77|P|2.5.1',
    'ORC|RE|ORD-991|LAB-261108-AB12',
    'OBR|1|ORD-991|ACC-5521|71020^CT Chest',
    ...body,
  ].join('\r');

function build(
  overrides: {
    order?: Record<string, unknown> | null;
    comments?: string;
    status?: string;
  } = {},
) {
  const order =
    overrides.order === null
      ? null
      : {
          id: 'o1',
          orderNo: 'LAB-261108-AB12',
          status: LabOrderStatus.PROCESSING,
          patientId: new Types.ObjectId(),
          ...overrides.order,
        };
  const analyser = {
    id: 'a1',
    _id: new Types.ObjectId(),
    name: 'City RIS',
    protocol: 'hl7',
    active: true,
    codes: [],
    createdByUserId: new Types.ObjectId(),
    save: jest.fn(async () => undefined),
  };
  const findOrder = jest.fn((filter: Record<string, unknown>) => {
    // Only an order-number search finds this order: no vial carries it.
    if ('samples.barcode' in filter) return exec(null);
    return exec(order);
  });
  const results = {
    get: jest.fn(async () => ({
      status: overrides.status ?? 'draft',
      comments: overrides.comments ?? '',
      tests: [
        {
          name: 'Echo',
          values: [{ name: 'Ejection fraction', value: '' }],
        },
      ],
    })),
    save: jest.fn(async () => undefined),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const messages = { create: jest.fn(async () => undefined) };
  const service = new PartnerAnalysersService(
    { findOne: () => exec(analyser) } as never,
    messages as never,
    { findOne: findOrder } as never,
    { findById: () => exec({ _id: PROVIDER, id: 'p1' }) } as never,
    results as never,
    audit as never,
  );
  return { service, results, findOrder, messages, audit, analyser };
}

describe('PartnerAnalysersService, hospital reports', () => {
  it('stores keys only as hashes', () => {
    expect(createHash('sha256').update(KEY).digest('hex')).toHaveLength(64);
  });

  it('finds the order by the number a hospital system quotes', async () => {
    const { service, findOrder } = build();
    const out = await service.ingest(
      KEY,
      RIS_MESSAGE(['OBX|1|TX|IMP^Impression||No focal lesion.']),
    );
    expect(out.items[0].orderNo).toBe('LAB-261108-AB12');
    expect(findOrder.mock.calls[1][0].orderNo).toEqual({
      $in: ['ORD-991', 'LAB-261108-AB12', 'ACC-5521'],
    });
  });

  it('puts a written report into the blank comment, for the pathologist to review', async () => {
    const { service, results, audit } = build();
    const out = await service.ingest(
      KEY,
      RIS_MESSAGE([
        'OBX|1|TX|IMP^Impression||No focal lesion.',
        'OBX|2|TX|IMP^Impression||Lungs clear.',
      ]),
    );
    expect(out.status).toBe('applied');
    expect(results.save).toHaveBeenCalledWith(
      expect.anything(),
      'o1',
      expect.objectContaining({ comments: 'No focal lesion.\nLungs clear.' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          label: expect.stringContaining('written report'),
        }),
      }),
    );
  });

  it('applies text and numbers from the same message', async () => {
    const { service, results } = build();
    const out = await service.ingest(
      KEY,
      RIS_MESSAGE([
        'OBX|1|TX|IMP^Impression||Normal.',
        'OBX|2|NM|EF^Ejection fraction||60|%',
      ]),
    );
    expect(out.items[0].applied).toBe(2);
    const saved = (results.save.mock.calls[0] as unknown as [
      unknown,
      string,
      { tests: { values: { value: string }[] }[] },
    ])[2];
    expect(saved.tests[0].values[0].value).toBe('60');
  });

  it('never replaces what someone has already written', async () => {
    const { service, results } = build({ comments: 'Pathologist note' });
    const out = await service.ingest(
      KEY,
      RIS_MESSAGE(['OBX|1|TX|IMP^Impression||Machine text']),
    );
    expect(results.save).not.toHaveBeenCalled();
    expect(out.items[0].skipped).toEqual(['report text: already written']);
    expect(out.status).toBe('unmatched');
  });

  it('counts a resent report as already delivered', async () => {
    const { service, results } = build({ comments: 'Same text' });
    const out = await service.ingest(
      KEY,
      RIS_MESSAGE(['OBX|1|TX|IMP^Impression||Same text']),
    );
    expect(results.save).not.toHaveBeenCalled();
    expect(out.items[0].unchanged).toBe(1);
    expect(out.status).toBe('applied');
  });

  it('logs a message whose order can’t be found, still acknowledging it', async () => {
    const { service, messages } = build({ order: null });
    const out = await service.ingest(
      KEY,
      RIS_MESSAGE(['OBX|1|TX|IMP^Impression||Text']),
    );
    expect(out.items[0].skipped).toEqual([
      'no order has this vial or order number',
    ]);
    expect(out.ack).toContain('MSA|AA|R77');
    expect(messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unmatched' }),
    );
  });

  it('won’t touch a released report', async () => {
    const { service, results } = build({ status: 'released' });
    const out = await service.ingest(
      KEY,
      RIS_MESSAGE(['OBX|1|TX|IMP^Impression||Text']),
    );
    expect(results.save).not.toHaveBeenCalled();
    expect(out.items[0].skipped).toEqual(['the report is already released']);
  });
});
