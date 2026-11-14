import { JwtService } from '@nestjs/jwt';
import { LiveBus } from '../common/live/live-bus.service';
import { RecordViewKeysService } from './record-view-keys.service';

describe('RecordViewKeysService', () => {
  function build() {
    const records = {
      assertRecordInShare: jest.fn().mockResolvedValue({}),
      downloadRecord: jest
        .fn()
        .mockResolvedValue({ buffer: Buffer.from('pdf'), fileName: 'r.pdf' }),
    };
    const config = { get: () => 'test-secret' };
    const live = new LiveBus();
    const svc = new RecordViewKeysService(
      new JwtService(),
      config as never,
      records as never,
      live,
    );
    svc.onModuleInit();
    return { svc, records, live };
  }

  it('opens the file once, then refuses the same key', async () => {
    const { svc, records } = build();
    const { key } = await svc.issue('u1', 'g1', 'r1');
    await expect(svc.redeem(key)).resolves.toEqual({
      buffer: Buffer.from('pdf'),
      fileName: 'r.pdf',
    });
    expect(records.downloadRecord).toHaveBeenCalledWith('u1', 'g1', 'r1');
    await expect(svc.redeem(key)).rejects.toThrow('already used');
  });

  it('kills outstanding keys the moment the share ends', async () => {
    const { svc, live } = build();
    const { key } = await svc.issue('u1', 'g2', 'r1');
    live.shareEnded({
      providerId: 'p',
      patientId: 'pt',
      grantId: 'g2',
      reason: 'revoked',
    });
    await expect(svc.redeem(key)).rejects.toThrow('share has ended');
  });

  it('refuses a forged or foreign token', async () => {
    const { svc } = build();
    const forged = await new JwtService().signAsync(
      { typ: 'record_view', sub: 'u', gid: 'g', rid: 'r', jti: 'x' },
      { secret: 'other' },
    );
    await expect(svc.redeem(forged)).rejects.toThrow('expired');
  });
});
