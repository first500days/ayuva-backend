import { ConfigService } from '@nestjs/config';
import {
  LogWhatsAppSender,
  MetaWhatsAppSender,
  TwilioWhatsAppSender,
  whatsAppSenderProvider,
} from './whatsapp-sender';

const META = {
  phoneNumberId: '12345',
  accessToken: 'tok',
  apiVersion: 'v23.0',
  language: 'en',
  reportTemplate: 'ayuva_report_ready',
  noticeTemplate: 'ayuva_notice',
};

const build = (values: Record<string, unknown>) =>
  (
    whatsAppSenderProvider as unknown as {
      useFactory: (c: ConfigService) => unknown;
    }
  ).useFactory({
    get: (k: string) => values[k],
  } as unknown as ConfigService);

describe('whatsAppSenderProvider', () => {
  it('prefers Meta over Twilio when both are configured', () => {
    expect(
      build({
        whatsappCloud: META,
        'sms.twilioAccountSid': 'a',
        'sms.twilioAuthToken': 'b',
        'sms.whatsappFrom': 'c',
      }),
    ).toBeInstanceOf(MetaWhatsAppSender);
  });

  it('falls back to Twilio, then to logging', () => {
    expect(
      build({
        whatsappCloud: { ...META, phoneNumberId: undefined },
        'sms.twilioAccountSid': 'a',
        'sms.twilioAuthToken': 'b',
        'sms.whatsappFrom': 'c',
      }),
    ).toBeInstanceOf(TwilioWhatsAppSender);
    expect(build({})).toBeInstanceOf(LogWhatsAppSender);
  });
});

describe('MetaWhatsAppSender', () => {
  const fetchMock = jest.fn();
  const original = global.fetch;
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = original;
  });
  beforeEach(() =>
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 }),
  );

  const sent = () => {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, body: JSON.parse(init.body as string) };
  };

  it('puts the secure link in the URL button, with nothing else about the patient', async () => {
    await new MetaWhatsAppSender(META).sendSecureLink(
      '+919876543210',
      'https://x/v/abc',
      'abc',
    );
    const { url, body } = sent();
    expect(url).toBe('https://graph.facebook.com/v23.0/12345/messages');
    expect(body.to).toBe('919876543210');
    expect(body.template.name).toBe('ayuva_report_ready');
    expect(body.template.components).toEqual([
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: 'abc' }],
      },
    ]);
  });

  it('cleans notice text so Meta accepts it as a template parameter', async () => {
    await new MetaWhatsAppSender(META).send(
      '+919876543210',
      'A new\nprescription    is ready',
      'https://x/app',
    );
    expect(sent().body.template.components[0].parameters[0].text).toBe(
      'A new prescription is ready https://x/app',
    );
  });

  it('reports failure on an API error or network problem', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await expect(
      new MetaWhatsAppSender(META).send('+91', 'x'),
    ).resolves.toBe(false);
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(
      new MetaWhatsAppSender(META).send('+91', 'x'),
    ).resolves.toBe(false);
  });
});
