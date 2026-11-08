import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { UserStatus } from '../../core/users/schemas/user.schema';
import { ReportLinksService } from './report-links.service';

const PATIENT = new Types.ObjectId();
const GUARDIAN = new Types.ObjectId();
const RECORD = new Types.ObjectId();
const T0 = new Date('2026-11-08T10:00:00Z');
const MIN = 60_000;

/* Just enough of a Mongoose model for this service: rows live in memory. */
function fakeLinks() {
  const rows: any[] = [];
  const decorate = (row: any) =>
    Object.assign(row, { save: jest.fn(async () => row) });
  return {
    rows,
    create: jest.fn(async (doc: any) => {
      const row = decorate({
        _id: new Types.ObjectId(),
        otpSends: 0,
        otpFailures: 0,
        createdAt: new Date(),
        ...doc,
      });
      rows.push(row);
      return row;
    }),
    findOne: jest.fn(({ jti }: any) => ({
      exec: async () => rows.find((r) => r.jti === jti) ?? null,
    })),
    findOneAndUpdate: jest.fn((filter: any, update: any) => ({
      exec: async () => {
        const row = rows.find((r) => r._id === filter._id);
        if (!row) return null;
        if (filter.usedAt && row.usedAt) return null;
        if (filter.replacedAt && row.replacedAt) return null;
        Object.assign(row, update.$set);
        for (const k of Object.keys(update.$unset ?? {})) delete row[k];
        return row;
      },
    })),
  };
}

const lean = (value: unknown) => ({
  select: () => ({ lean: () => ({ exec: async () => value }) }),
});

function build(overrides: {
  env?: Record<string, unknown>;
  user?: Record<string, unknown>;
  guardian?: Record<string, unknown>;
  smsLive?: boolean;
} = {}) {
  const links = fakeLinks();
  const patient = {
    _id: PATIENT,
    phone: '+919876543210',
    email: 'patient@example.com',
    status: UserStatus.ACTIVE,
    ...overrides.user,
  };
  const users = {
    findById: jest.fn((id: unknown) =>
      lean(String(id) === String(GUARDIAN) ? overrides.guardian : patient),
    ),
  };
  const record = {
    id: RECORD.toString(),
    fileRef: 'records/x/y.pdf',
    systemFileName: 'Lab report.pdf',
    originalFileName: 'orig.pdf',
    providerName: 'City Lab',
    mimeType: 'application/pdf',
    recordDate: T0,
  };
  const records = {
    findById: jest.fn(() => ({ exec: async () => record })),
  };
  const sms = {
    live: overrides.smsLive ?? true,
    send: jest.fn(async () => true),
  };
  const mail = { sendMail: jest.fn(async () => true) };
  const storage = { read: jest.fn(async () => Buffer.from('%PDF')) };
  const audit = { record: jest.fn(async () => undefined) };
  const env: Record<string, unknown> = {
    'jwt.accessSecret': 'test-secret',
    'frontend.url': 'https://app.test',
    nodeEnv: 'production',
    ...overrides.env,
  };
  const jwt = new JwtService({});
  const service = new ReportLinksService(
    links as never,
    users as never,
    records as never,
    jwt,
    { get: (k: string) => env[k] } as unknown as ConfigService,
    mail as never,
    storage as never,
    audit as never,
    sms as never,
  );
  const issue = () =>
    service.issue({ recordId: RECORD, patientId: PATIENT, channel: 'whatsapp' });
  /** The 6-digit code from the SMS that was just sent. */
  const lastCode = () =>
    (sms.send.mock.calls.at(-1) as unknown as [string, string])[1].slice(0, 6);
  return { service, links, sms, mail, storage, audit, jwt, issue, lastCode };
}

describe('ReportLinksService', () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: T0,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'queueMicrotask',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
      ],
    });
  });
  afterEach(() => jest.useRealTimers());
  const advance = (ms: number) => jest.setSystemTime(Date.now() + ms);

  describe('the signed link', () => {
    it('carries only an opaque id and lasts 30 minutes', async () => {
      const { issue, jwt } = build();
      const { token, url } = await issue();
      const claims = jwt.decode<Record<string, unknown>>(token);
      expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'jti', 'purpose']);
      expect((claims.exp as number) - (claims.iat as number)).toBe(30 * 60);
      expect(url).toBe(`https://app.test/v/${token}`);
    });

    it('holds the lifetime to 15–30 minutes whatever is configured', async () => {
      for (const [set, expected] of [
        [120, 30],
        [5, 15],
        [20, 20],
      ]) {
        const { issue, jwt } = build({ env: { 'reportLinks.ttlMinutes': set } });
        const claims = jwt.decode<{ exp: number; iat: number }>(
          (await issue()).token,
        );
        expect(claims.exp - claims.iat).toBe(expected * 60);
      }
    });

    it('refuses a forged or foreign token', async () => {
      const { service, jwt } = build();
      const forged = await jwt.signAsync(
        { purpose: 'report_link', jti: 'x' },
        { secret: 'attacker' },
      );
      await expect(service.status(forged)).rejects.toThrow('isn’t valid');
      await expect(service.status('garbage')).rejects.toThrow('isn’t valid');
    });

    it('reports ready, then expired, without changing anything on a page view', async () => {
      const { service, issue, links } = build();
      const { token } = await issue();
      await expect(service.status(token)).resolves.toEqual({ state: 'ready' });
      expect(links.rows[0].save).not.toHaveBeenCalled();
      advance(31 * MIN);
      await expect(service.status(token)).resolves.toEqual({ state: 'expired' });
    });
  });

  describe('the one-time code', () => {
    it('goes to the phone, masked in the reply, with no patient details in the text', async () => {
      const { service, issue, sms } = build();
      const { token } = await issue();
      const res = await service.sendCode(token);
      expect(res).toMatchObject({ sentTo: 'sms', expiresInSeconds: 300 });
      expect(res.masked.endsWith('3210')).toBe(true);
      expect(res).not.toHaveProperty('devCode');
      const [to, text] = sms.send.mock.calls[0] as unknown as [string, string];
      expect(to).toBe('+919876543210');
      expect(text).toMatch(/^\d{6} is your Ayuvax verification code/);
    });

    it('falls back to email when the patient has no phone', async () => {
      const { service, issue, mail } = build({ user: { phone: undefined } });
      const { token } = await issue();
      await expect(service.sendCode(token)).resolves.toMatchObject({
        sentTo: 'email',
      });
      expect(mail.sendMail).toHaveBeenCalledTimes(1);
    });

    it('never mails a placeholder address', async () => {
      const { service, issue, mail } = build({
        user: { phone: undefined, email: 'member-1@family.invalid' },
      });
      const { token } = await issue();
      await expect(service.sendCode(token)).rejects.toThrow('couldn’t send');
      expect(mail.sendMail).not.toHaveBeenCalled();
    });

    it('only exposes a dev code when SMS is log-only outside production', async () => {
      const dev = build({ smsLive: false, env: { nodeEnv: 'development' } });
      const res = await dev.service.sendCode((await dev.issue()).token);
      expect(res.devCode).toMatch(/^\d{6}$/);
    });

    it('waits between sends and caps them', async () => {
      const { service, issue } = build();
      const { token } = await issue();
      await service.sendCode(token);
      await expect(service.sendCode(token)).rejects.toThrow('Wait a minute');
      for (let i = 0; i < 4; i++) {
        advance(61_000);
        await service.sendCode(token);
      }
      advance(61_000);
      await expect(service.sendCode(token)).rejects.toThrow('Too many codes');
    });

    it('sends a code to a guardian for the family member they manage', async () => {
      const { service, issue, sms } = build({
        user: { managedBy: GUARDIAN, phone: undefined },
        guardian: {
          _id: GUARDIAN,
          phone: '+911111111111',
          email: 'g@example.com',
          status: UserStatus.ACTIVE,
        },
      });
      await service.sendCode((await issue()).token);
      expect((sms.send.mock.calls[0] as unknown as string[])[0]).toBe(
        '+911111111111',
      );
    });
  });

  describe('opening the report', () => {
    it('opens once with the right code, audits it, and then the link is spent', async () => {
      const { service, issue, lastCode, audit } = build();
      const { token } = await issue();
      await service.sendCode(token);
      const res = await service.verifyCode(token, lastCode(), '1.2.3.4');
      expect(res.report.title).toBe('Lab report.pdf');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'report_link_opened',
          actorId: PATIENT.toString(),
          ipAddress: '1.2.3.4',
        }),
      );
      await expect(service.status(token)).resolves.toEqual({ state: 'used' });
      await expect(service.verifyCode(token, '000000')).rejects.toThrow('already been used');
    });

    it('locks after five wrong codes', async () => {
      const { service, issue, lastCode } = build();
      const { token } = await issue();
      await service.sendCode(token);
      const right = lastCode();
      const wrong = right === '111111' ? '222222' : '111111';
      for (let i = 0; i < 4; i++)
        await expect(service.verifyCode(token, wrong)).rejects.toThrow('doesn’t match');
      await expect(service.verifyCode(token, wrong)).rejects.toThrow('Too many wrong');
      await expect(service.verifyCode(token, right)).rejects.toThrow('Too many wrong');
    });

    it('rejects a code that has timed out', async () => {
      const { service, issue, lastCode } = build();
      const { token } = await issue();
      await service.sendCode(token);
      advance(6 * MIN);
      await expect(service.verifyCode(token, lastCode())).rejects.toThrow('expired');
    });

    it('refuses an expired link even with a valid code', async () => {
      const { service, issue, lastCode } = build();
      const { token } = await issue();
      await service.sendCode(token);
      const code = lastCode();
      advance(31 * MIN);
      await expect(service.verifyCode(token, code)).rejects.toThrow('expired');
    });

    it('serves the file for the view session only', async () => {
      const { service, issue, lastCode, storage } = build();
      const { token } = await issue();
      await service.sendCode(token);
      const { viewToken } = await service.verifyCode(token, lastCode());
      const file = await service.file(`Bearer ${viewToken}`);
      expect(file.mimeType).toBe('application/pdf');
      expect(storage.read).toHaveBeenCalledWith('records/x/y.pdf');
      // The emailed link itself can't fetch the file.
      await expect(service.file(`Bearer ${token}`)).rejects.toThrow('Invalid session');
      await expect(service.file(undefined)).rejects.toThrow('missing');
      advance(11 * MIN);
      await expect(service.file(`Bearer ${viewToken}`)).rejects.toThrow('ended');
    });
  });

  describe('asking for a fresh link', () => {
    it('replaces an expired link and refuses to replace it twice', async () => {
      const { service, issue } = build();
      const { token } = await issue();
      advance(31 * MIN);
      const { issued } = await service.renew(token);
      await expect(service.status(issued.token)).resolves.toEqual({ state: 'ready' });
      await expect(service.status(token)).resolves.toEqual({ state: 'expired' });
      await expect(service.renew(token)).rejects.toThrow('newer link');
    });

    it('keeps a live link as it is', async () => {
      const { service, issue } = build();
      await expect(service.renew((await issue()).token)).rejects.toThrow('still works');
    });

    it('stops renewing two weeks after the first send', async () => {
      const { service, issue } = build();
      const { token } = await issue();
      advance(15 * 86_400_000);
      await expect(service.renew(token)).rejects.toThrow('can’t be renewed');
    });

    it('stops after five renewals', async () => {
      const { service } = build();
      const { token } = await service.issue({
        recordId: RECORD,
        patientId: PATIENT,
        channel: 'email',
        renewals: 5,
      });
      advance(31 * MIN);
      await expect(service.renew(token)).rejects.toThrow('can’t be renewed');
    });
  });
});
