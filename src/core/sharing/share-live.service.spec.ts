import { Types } from 'mongoose';
import { ShareLiveService } from './share-live.service';

const exec = (v: unknown) => ({ exec: () => Promise.resolve(v) });

describe('ShareLiveService', () => {
  const providerId = new Types.ObjectId();
  const orgId = new Types.ObjectId().toString();
  const grant = {
    _id: new Types.ObjectId(),
    id: 'g1',
    organisationId: orgId,
    userId: new Types.ObjectId(),
  };

  function build(redisReady: boolean, claimed = 1) {
    const grantModel = {
      find: jest.fn(() => ({ limit: () => exec([grant]) })),
      updateOne: jest.fn(() => exec({ modifiedCount: claimed })),
    };
    const orgModel = {
      findById: jest.fn(() => ({
        select: () => ({ lean: () => exec({ providerId }) }),
      })),
    };
    const live = { shareEnded: jest.fn() };
    const redis = {
      status: redisReady ? 'ready' : 'end',
      publish: jest.fn().mockResolvedValue(1),
    };
    const svc = new ShareLiveService(
      grantModel as never,
      orgModel as never,
      live as never,
      redis as never,
    );
    return { svc, live, redis, grantModel };
  }

  it('announces an expired share to this instance when Redis is down', async () => {
    const { svc, live } = build(false);
    expect(await svc.sweep()).toBe(1);
    expect(live.shareEnded).toHaveBeenCalledWith({
      providerId: providerId.toString(),
      patientId: grant.userId.toString(),
      grantId: 'g1',
      reason: 'expired',
    });
  });

  it('skips a share another instance already claimed', async () => {
    const { svc, live } = build(false, 0);
    expect(await svc.sweep()).toBe(0);
    expect(live.shareEnded).not.toHaveBeenCalled();
  });

  it('publishes on Redis when connected, so every instance tells its sockets', async () => {
    const { svc, live, redis } = build(true);
    (svc as unknown as { sub: object }).sub = {};
    await svc.ended(grant as never, 'revoked');
    expect(redis.publish).toHaveBeenCalledWith(
      'ayuva:share-ended',
      expect.stringContaining('"reason":"revoked"'),
    );
    expect(live.shareEnded).not.toHaveBeenCalled();
  });
});
