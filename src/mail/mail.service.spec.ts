import { ConfigService } from '@nestjs/config';
import { MailService, maskEmail } from './mail.service';

const service = (values: Record<string, string>) =>
  new MailService({ get: (k: string) => values[k] } as unknown as ConfigService);

describe('maskEmail', () => {
  it('keeps the domain and hides most of the name', () => {
    expect(maskEmail('patient@example.com')).toBe('pa***@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('MailService', () => {
  const fetchMock = jest.fn();
  const original = global.fetch;
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = original;
  });
  beforeEach(() => fetchMock.mockReset().mockResolvedValue({ ok: true }));

  it('only logs when no provider is configured', async () => {
    const mail = service({});
    expect(mail.live).toBe(false);
    await expect(mail.sendMail('a@b.co', 'S', '<p>x</p>')).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends through SendGrid with click tracking off, so signed links are not rewritten', async () => {
    const mail = service({
      'sendgrid.apiKey': 'k',
      'mail.from': 'Ayuva <noreply@ayuva.com>',
    });
    expect(mail.live).toBe(true);
    await expect(mail.sendMail('a@b.co', 'S', '<p>x</p>')).resolves.toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.from).toEqual({ name: 'Ayuva', email: 'noreply@ayuva.com' });
    expect(body.personalizations[0].to[0].email).toBe('a@b.co');
    expect(body.tracking_settings.click_tracking.enable).toBe(false);
  });

  it('reports a SendGrid failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    await expect(
      service({ 'sendgrid.apiKey': 'k' }).sendMail('a@b.co', 'S', 'x'),
    ).resolves.toBe(false);
  });
});
