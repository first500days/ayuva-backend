import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { withDefaults } from '../app-notifications.service';
import {
  REPORT_READY_TITLE,
  ReportDispatchService,
} from './report-dispatch.service';

const PATIENT = new Types.ObjectId();
const RECORD = new Types.ObjectId();
const PROVIDER = new Types.ObjectId();

const INPUT = {
  patientId: PATIENT,
  recordId: RECORD,
  providerId: PROVIDER,
  actorUserId: new Types.ObjectId().toString(),
};

function build(
  options: {
    contact?: Record<string, unknown> | null;
    prefs?: Record<string, boolean>;
    env?: Record<string, unknown>;
    whatsappLive?: boolean;
    mailLive?: boolean;
    devices?: number;
    delivered?: number;
  } = {},
) {
  const contact =
    options.contact === null
      ? null
      : {
          accountId: PATIENT.toString(),
          phone: '+919876543210',
          email: 'patient@example.com',
          prefs: withDefaults(options.prefs),
          ...options.contact,
        };
  const links = {
    contact: jest.fn(async () => contact),
    issue: jest.fn(async ({ channel }: { channel: string }) => ({
      token: `tok-${channel}`,
      url: `https://app.test/v/tok-${channel}`,
      expiresAt: new Date(),
    })),
    renew: jest.fn(),
  };
  const push = {
    send: jest.fn(async () => ({
      devices: options.devices ?? 1,
      delivered: options.delivered ?? options.devices ?? 1,
    })),
  };
  const mail = {
    live: options.mailLive ?? true,
    sendMail: jest.fn(async () => true),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const whatsapp = {
    live: options.whatsappLive ?? true,
    send: jest.fn(async () => true),
    sendSecureLink: jest.fn(async () => true),
  };
  const env: Record<string, unknown> = { nodeEnv: 'production', ...options.env };
  const service = new ReportDispatchService(
    links as never,
    push as never,
    mail as never,
    audit as never,
    { get: (k: string) => env[k] } as unknown as ConfigService,
    whatsapp as never,
  );
  return { service, links, push, mail, audit, whatsapp };
}

const status = (
  channels: { channel: string; status: string }[],
  name: string,
) => channels.find((c) => c.channel === name)?.status;

describe('ReportDispatchService', () => {
  it('sends over the app, WhatsApp and email together', async () => {
    const { service, push, whatsapp, mail } = build();
    const { channels } = await service.reportApproved(INPUT);
    expect(channels.map((c) => c.status)).toEqual(['sent', 'sent', 'sent']);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(whatsapp.sendSecureLink).toHaveBeenCalledTimes(1);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });

  it('wakes the app with only opaque ids in the push', async () => {
    const { service, push } = build();
    await service.reportApproved(INPUT);
    const [account, payload, options] = push.send.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(account).toBe(PATIENT.toString());
    expect(options).toEqual({ wake: true });
    expect(payload).toEqual({
      title: REPORT_READY_TITLE,
      body: 'Open the Ayuva app to see them.',
      data: { type: 'report_ready', recordId: RECORD.toString() },
    });
  });

  it('tells a guardian which family member the report belongs to', async () => {
    const { service, push } = build({ contact: { profileId: 'member-1' } });
    await service.reportApproved(INPUT);
    expect(
      (push.send.mock.calls[0] as unknown as [string, { data: object }])[1].data,
    ).toEqual({
      type: 'report_ready',
      recordId: RECORD.toString(),
      profileId: 'member-1',
    });
  });

  it('issues a separate link per channel, since each opens only once', async () => {
    const { service, links, whatsapp, mail } = build();
    await service.reportApproved(INPUT);
    expect(links.issue).toHaveBeenCalledTimes(2);
    expect(whatsapp.sendSecureLink).toHaveBeenCalledWith(
      '+919876543210',
      'https://app.test/v/tok-whatsapp',
      'tok-whatsapp',
      expect.any(String),
    );
    const [to, subject, html] = mail.sendMail.mock.calls[0] as unknown as string[];
    expect(to).toBe('patient@example.com');
    expect(subject).toBe(REPORT_READY_TITLE);
    expect(html).toContain('https://app.test/v/tok-email');
  });

  it('respects the patient muting results, or one channel', async () => {
    const muted = build({ prefs: { results: false } });
    const all = await muted.service.reportApproved(INPUT);
    expect(all.channels.map((c) => c.status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(muted.links.issue).not.toHaveBeenCalled();

    const noWhatsApp = build({ prefs: { whatsapp: false } });
    const one = await noWhatsApp.service.reportApproved(INPUT);
    expect(status(one.channels, 'whatsapp')).toBe('skipped');
    expect(status(one.channels, 'email')).toBe('sent');
  });

  it('skips channels with no destination, without making a link', async () => {
    const { service, links } = build({
      contact: { phone: undefined, email: undefined },
    });
    const { channels } = await service.reportApproved(INPUT);
    expect(status(channels, 'whatsapp')).toBe('skipped');
    expect(status(channels, 'email')).toBe('skipped');
    expect(links.issue).not.toHaveBeenCalled();
  });

  it('says so when the patient has no phone signed in', async () => {
    const { service } = build({ devices: 0 });
    const { channels } = await service.reportApproved(INPUT);
    expect(channels[0]).toEqual({
      channel: 'push',
      status: 'skipped',
      detail: 'The patient has no phone signed in',
    });
  });

  it('marks push failed when no device took it', async () => {
    const { service } = build({ devices: 2, delivered: 0 });
    const { channels } = await service.reportApproved(INPUT);
    expect(status(channels, 'push')).toBe('failed');
  });

  it('skips unconfigured channels in production and never exposes a link', async () => {
    const { service, links } = build({ whatsappLive: false, mailLive: false });
    const { channels } = await service.reportApproved(INPUT);
    expect(status(channels, 'whatsapp')).toBe('skipped');
    expect(status(channels, 'email')).toBe('skipped');
    expect(links.issue).not.toHaveBeenCalled();
    expect(JSON.stringify(channels)).not.toContain('devUrl');
  });

  it('shows the link in development when the channel only logs', async () => {
    const { service } = build({
      whatsappLive: false,
      env: { nodeEnv: 'development' },
    });
    const { channels } = await service.reportApproved(INPUT);
    expect(channels.find((c) => c.channel === 'whatsapp')?.devUrl).toBe(
      'https://app.test/v/tok-whatsapp',
    );
    expect(channels.find((c) => c.channel === 'email')?.devUrl).toBeUndefined();
  });

  it('keeps one channel failing from stopping the others', async () => {
    const { service, whatsapp } = build();
    whatsapp.sendSecureLink.mockRejectedValue(new Error('down'));
    const { channels } = await service.reportApproved(INPUT);
    expect(status(channels, 'whatsapp')).toBe('failed');
    expect(status(channels, 'email')).toBe('sent');
    expect(status(channels, 'push')).toBe('sent');
  });

  it('never fails the sign-off that raised it', async () => {
    const { service, links } = build();
    links.contact.mockRejectedValue(new Error('db down'));
    await expect(service.reportApproved(INPUT)).resolves.toEqual({ channels: [] });
  });

  it('records what went out in the audit log', async () => {
    const { service, audit } = build({ devices: 0 });
    await service.reportApproved(INPUT);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'report_dispatched',
        targetId: RECORD.toString(),
        metadata: expect.objectContaining({
          label: 'Report sent: whatsapp, email',
          channels: { push: 'skipped', whatsapp: 'sent', email: 'sent' },
        }),
      }),
    );
  });

  it('sends a renewed link only to the details on record', async () => {
    const { service, links, whatsapp } = build();
    links.renew.mockResolvedValue({
      link: { channel: 'whatsapp', patientId: PATIENT, jti: 'j' },
      issued: { token: 't2', url: 'https://app.test/v/t2', expiresAt: new Date() },
    });
    const res = await service.renew('old');
    expect(whatsapp.sendSecureLink).toHaveBeenCalledWith(
      '+919876543210',
      'https://app.test/v/t2',
      't2',
      expect.any(String),
    );
    expect(res.sentVia).toBe('whatsapp');
    expect(res.masked?.endsWith('3210')).toBe(true);
    expect(JSON.stringify(res)).not.toContain('t2');
  });
});
