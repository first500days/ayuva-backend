import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { PartnerFhirService } from './partner-fhir.service';

const KEY = 'a'.repeat(64);
const PROVIDER = new Types.ObjectId();
const actor = {
  provider: { _id: PROVIDER, id: PROVIDER.toString() },
  userId: new Types.ObjectId().toString(),
  ip: '1.2.3.4',
} as never;

const HOSPITAL = 'http://hospital.test/fhir/r4';
const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
  json: async () => body,
});

const REPORT_BUNDLE = {
  resourceType: 'Bundle',
  entry: [
    {
      resource: {
        resourceType: 'DiagnosticReport',
        id: 'r1',
        code: { text: 'Panel' },
        result: [{ reference: 'Observation/o1' }],
      },
    },
    {
      resource: {
        resourceType: 'Observation',
        id: 'o1',
        code: { text: 'Glucose' },
        valueQuantity: { value: 5, unit: 'mmol/L' },
      },
    },
  ],
};

function build() {
  const rows: any[] = [];
  const connections = {
    create: jest.fn(async (doc: any) => {
      const row = {
        id: new Types.ObjectId().toString(),
        active: true,
        ...doc,
        save: jest.fn(async () => undefined),
        deleteOne: jest.fn(async () => undefined),
      };
      rows.push(row);
      return row;
    }),
    findOne: jest.fn(({ _id }: any) => ({
      exec: async () => rows.find((r) => r.id === _id) ?? null,
    })),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new PartnerFhirService(
    connections as never,
    {
      get: (k: string) =>
        k === 'storage.encryptionKey' ? KEY : k === 'nodeEnv' ? 'development' : undefined,
    } as unknown as ConfigService,
    audit as never,
  );
  return { service, rows, audit };
}

describe('PartnerFhirService', () => {
  const fetchMock = jest.fn();
  const original = global.fetch;
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = original;
  });
  beforeEach(() => fetchMock.mockReset());

  const open = { name: 'City Hospital', baseUrl: `${HOSPITAL}/`, authType: 'none' as const };
  const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
  const headers = (i = 0) =>
    (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>;

  describe('connections', () => {
    it('stores the secret encrypted and never shows it', async () => {
      const { service, rows } = build();
      const view = await service.create(actor, {
        ...open,
        authType: 'bearer',
        secret: 'top-secret',
      });
      expect(rows[0].secretEnc).toBeTruthy();
      expect(rows[0].secretEnc).not.toContain('top-secret');
      expect(JSON.stringify(view)).not.toContain('top-secret');
      expect(view.baseUrl).toBe(HOSPITAL);
    });

    it('asks for what each sign-in type needs', async () => {
      const { service } = build();
      await expect(
        service.create(actor, { ...open, authType: 'bearer' }),
      ).rejects.toThrow('secret');
      await expect(
        service.create(actor, { ...open, authType: 'basic', secret: 's' }),
      ).rejects.toThrow('username');
      await expect(
        service.create(actor, {
          ...open,
          authType: 'client_credentials',
          secret: 's',
        }),
      ).rejects.toThrow('client ID');
    });

    it('recognises a real FHIR server when testing', async () => {
      const { service } = build();
      const c = await service.create(actor, open);
      fetchMock.mockResolvedValue(
        reply({
          resourceType: 'CapabilityStatement',
          fhirVersion: '4.0.1',
          software: { name: 'HAPI' },
        }),
      );
      await expect(service.test(actor, c.id)).resolves.toEqual({
        ok: true,
        fhirVersion: '4.0.1',
        software: 'HAPI',
      });
      expect(urls()[0]).toBe(`${HOSPITAL}/metadata`);
    });

    it('rejects something that is not a FHIR server', async () => {
      const { service } = build();
      const c = await service.create(actor, open);
      fetchMock.mockResolvedValue(reply({ hello: 'world' }));
      await expect(service.test(actor, c.id)).rejects.toThrow('FHIR server');
    });
  });

  describe('search', () => {
    it('queries both endpoints by patient and encounter and joins the results', async () => {
      const { service, audit } = build();
      const c = await service.create(actor, open);
      fetchMock.mockImplementation(async (url: string) =>
        reply(
          url.includes('/DiagnosticReport')
            ? REPORT_BUNDLE
            : { resourceType: 'Bundle', entry: [REPORT_BUNDLE.entry[1]] },
        ),
      );
      const out = await service.search(actor, c.id, {
        patient: 'P1',
        encounter: 'E1',
      });
      expect(out.reports[0].values[0].name).toBe('Glucose');
      expect(out.observations).toHaveLength(1);
      const report = new URL(urls().find((u) => u.includes('DiagnosticReport'))!);
      expect(Object.fromEntries(report.searchParams)).toEqual({
        _count: '50',
        patient: 'P1',
        encounter: 'E1',
        _include: 'DiagnosticReport:result',
      });
      expect(headers().Accept).toBe('application/fhir+json');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            label: expect.stringContaining('1 report(s), 1 result(s)'),
          }),
        }),
      );
    });

    it('needs a patient or an encounter', async () => {
      const { service } = build();
      const c = await service.create(actor, open);
      await expect(service.search(actor, c.id, {})).rejects.toThrow('patient ID');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('won’t use a connection that is switched off', async () => {
      const { service, rows } = build();
      const c = await service.create(actor, open);
      rows[0].active = false;
      await expect(
        service.search(actor, c.id, { patient: 'P' }),
      ).rejects.toThrow('switched off');
    });

    it('follows paging on the same server, and stops at the page limit', async () => {
      const { service } = build();
      const c = await service.create(actor, open);
      fetchMock.mockImplementation(async () =>
        reply({
          resourceType: 'Bundle',
          link: [{ relation: 'next', url: `${HOSPITAL}/next` }],
        }),
      );
      await service.search(actor, c.id, { patient: 'P' });
      expect(fetchMock).toHaveBeenCalledTimes(6); // three pages from each endpoint
    });

    it('never follows a paging link to another server', async () => {
      const { service } = build();
      const c = await service.create(actor, {
        ...open,
        authType: 'bearer',
        secret: 's',
      });
      fetchMock.mockImplementation(async () =>
        reply({
          resourceType: 'Bundle',
          link: [{ relation: 'next', url: 'http://evil.test/steal' }],
        }),
      );
      await service.search(actor, c.id, { patient: 'P' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(urls().some((u) => u.includes('evil.test'))).toBe(false);
    });

    it('explains failures without leaking the response', async () => {
      const { service } = build();
      const c = await service.create(actor, open);
      fetchMock.mockResolvedValue(reply({ secret: 'x' }, 500));
      await expect(
        service.search(actor, c.id, { patient: 'P' }),
      ).rejects.toThrow('error (500)');
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED 10.0.0.1'));
      await expect(
        service.search(actor, c.id, { patient: 'P' }),
      ).rejects.toThrow('could not be reached');
    });

    it('refuses an oversized response', async () => {
      const { service } = build();
      const c = await service.create(actor, open);
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => 'x'.repeat(5_000_001),
      });
      await expect(
        service.search(actor, c.id, { patient: 'P' }),
      ).rejects.toThrow('too much data');
    });
  });

  describe('sign-in', () => {
    it('sends a bearer token', async () => {
      const { service } = build();
      const c = await service.create(actor, {
        ...open,
        authType: 'bearer',
        secret: 'tok',
      });
      fetchMock.mockResolvedValue(reply({ resourceType: 'CapabilityStatement' }));
      await service.test(actor, c.id);
      expect(headers().Authorization).toBe('Bearer tok');
    });

    it('sends basic credentials', async () => {
      const { service } = build();
      const c = await service.create(actor, {
        ...open,
        authType: 'basic',
        username: 'u',
        secret: 'p',
      });
      fetchMock.mockResolvedValue(reply({ resourceType: 'CapabilityStatement' }));
      await service.test(actor, c.id);
      expect(headers().Authorization).toBe(
        `Basic ${Buffer.from('u:p').toString('base64')}`,
      );
    });

    it('gets a client-credentials token once and reuses it', async () => {
      const { service } = build();
      const c = await service.create(actor, {
        ...open,
        authType: 'client_credentials',
        username: 'client',
        secret: 'shh',
        tokenUrl: 'http://hospital.test/oauth/token',
        scope: 'system/*.read',
      });
      fetchMock.mockImplementation(async (url: string) =>
        url.endsWith('/oauth/token')
          ? reply({ access_token: 'minted', expires_in: 3600 })
          : reply({ resourceType: 'CapabilityStatement' }),
      );
      await service.test(actor, c.id);
      await service.test(actor, c.id);
      const tokenCalls = urls().filter((u) => u.endsWith('/oauth/token'));
      expect(tokenCalls).toHaveLength(1);
      const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
      expect(body.get('grant_type')).toBe('client_credentials');
      expect(body.get('client_id')).toBe('client');
      expect(body.get('client_secret')).toBe('shh');
      expect(body.get('scope')).toBe('system/*.read');
      expect(headers(1).Authorization).toBe('Bearer minted');
    });

    it('explains a refused sign-in', async () => {
      const { service } = build();
      const c = await service.create(actor, {
        ...open,
        authType: 'client_credentials',
        username: 'client',
        secret: 'shh',
        tokenUrl: 'http://hospital.test/oauth/token',
      });
      fetchMock.mockResolvedValue(reply({}, 401));
      await expect(service.test(actor, c.id)).rejects.toThrow('refused');
    });
  });

  it('keeps one organisation out of another’s connections', async () => {
    const { service } = build();
    await expect(
      service.test(actor, new Types.ObjectId().toString()),
    ).rejects.toThrow('not found');
    await expect(service.test(actor, 'not-an-id')).rejects.toThrow('not found');
  });
});
