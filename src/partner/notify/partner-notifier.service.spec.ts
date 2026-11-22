import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { ProviderCategory } from '../../core/providers/schemas/provider.schema';
import { StaffRole } from '../rbac/partner-permissions';
import { MemberStatus } from '../staff/schemas/partner-member.schema';
import { PartnerNotifierService } from './partner-notifier.service';
import { PartnerTrigger } from './partner-triggers';

const PROVIDER = new Types.ObjectId();
const USER = new Types.ObjectId();

const exec = (value: unknown) => ({ exec: async () => value });

function build(rule: Record<string, unknown>, member: Record<string, unknown> = {}) {
  const push = { send: jest.fn(async () => ({ devices: 1, delivered: 1 })) };
  const whatsapp = { live: true, send: jest.fn(async () => true) };
  const sms = { send: jest.fn(async () => true) };
  const mail = { sendMail: jest.fn(async () => true) };
  const notifications = { create: jest.fn(async () => undefined) };
  const settings = {
    rules: [
      {
        trigger: PartnerTrigger.CRITICAL_LAB_RESULT,
        inApp: false,
        email: false,
        sms: false,
        desktop: false,
        webhook: false,
        roles: [StaffRole.DOCTOR],
        ...rule,
      },
    ],
  };
  const service = new PartnerNotifierService(
    {
      find: () =>
        exec([
          {
            id: 'm1',
            userId: USER,
            role: StaffRole.DOCTOR,
            email: 'doc@example.com',
            phone: '+919876543210',
            status: MemberStatus.ACTIVE,
            ...member,
          },
        ]),
    } as never,
    { findOne: () => exec(settings) } as never,
    {} as never,
    {
      findById: () =>
        exec({ name: 'City Lab', type: ProviderCategory.DIAGNOSTIC }),
    } as never,
    {} as never,
    notifications as never,
    mail as never,
    sms as never,
    { get: () => 'https://portal.test' } as unknown as ConfigService,
    whatsapp as never,
    push as never,
  );
  return { service, push, whatsapp };
}

const EVENT = {
  trigger: PartnerTrigger.CRITICAL_LAB_RESULT,
  title: 'CRITICAL lab result',
  message: '{patient} has a critical potassium of 7.1',
  safeMessage: 'A referred patient has a critical lab result — open the portal now.',
  route: '/partner/lab/critical',
};

describe('PartnerNotifierService escalation channels', () => {
  it('sends app push with no patient details when the rule asks for it', async () => {
    const { service, push, whatsapp } = build({ push: true });
    await service.emit(PROVIDER, EVENT);
    expect(push.send).toHaveBeenCalledWith(USER.toString(), {
      title: 'CRITICAL lab result',
      body: EVENT.safeMessage,
      data: { type: 'partner_alert', trigger: EVENT.trigger },
    });
    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('keeps a name in the title out of push', async () => {
    const { service, push } = build({ push: true });
    await service.emit(PROVIDER, {
      ...EVENT,
      title: 'Dr Rao mentioned you',
      safeTitle: 'You were mentioned in a case discussion',
    });
    expect(JSON.stringify(push.send.mock.calls)).not.toContain('Rao');
  });

  it('sends WhatsApp with the safe text and a portal link, never the portal message', async () => {
    const { service, whatsapp, push } = build({ whatsapp: true });
    await service.emit(PROVIDER, EVENT);
    expect(whatsapp.send).toHaveBeenCalledWith(
      '+919876543210',
      `Ayuvax alert: ${EVENT.safeMessage}`,
      'https://portal.test/partner/dashboard',
    );
    expect(JSON.stringify(whatsapp.send.mock.calls)).not.toContain('potassium');
    expect(push.send).not.toHaveBeenCalled();
  });

  it('skips WhatsApp for staff with no mobile number', async () => {
    const { service, whatsapp } = build(
      { whatsapp: true },
      { phone: undefined },
    );
    await service.emit(PROVIDER, EVENT);
    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('treats rules saved before these channels existed as off', async () => {
    const { service, whatsapp, push } = build({});
    await service.emit(PROVIDER, EVENT);
    expect(push.send).not.toHaveBeenCalled();
    expect(whatsapp.send).not.toHaveBeenCalled();
  });

  it('never lets a failing channel fail the event that raised it', async () => {
    const { service, push } = build({ push: true });
    push.send.mockRejectedValue(new Error('down'));
    await expect(service.emit(PROVIDER, EVENT)).resolves.toBeUndefined();
  });
});
