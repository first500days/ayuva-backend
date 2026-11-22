import { Types } from 'mongoose';
import { PlanTier } from '../../admin/subscriptions/schemas/subscription.schema';
import { PlanUpdatesService } from './plan-updates.service';

const chain = (value: unknown) => ({
  sort: () => chain(value),
  select: () => chain(value),
  limit: () => chain(value),
  lean: () => chain(value),
  exec: () => Promise.resolve(value),
});

describe('PlanUpdatesService', () => {
  const userId = new Types.ObjectId().toString();
  const premium = {
    _id: new Types.ObjectId(),
    tier: PlanTier.PREMIUM,
    name: 'Premium',
    features: ['Family accounts'],
    limits: { familyMembers: 6 },
  };

  function build(redisReady: boolean) {
    let sub: unknown = { planId: premium._id, renewsAt: null };
    const planModel = {
      findById: jest.fn(() => chain(premium)),
      findOne: jest.fn(() =>
        chain({ tier: PlanTier.FREE, name: 'Free', features: [], limits: {} }),
      ),
    };
    const subModel = {
      findOne: jest.fn(() => chain(sub)),
      find: jest.fn(() => chain([{ userId: new Types.ObjectId(userId) }])),
    };
    const push = {
      send: jest.fn().mockResolvedValue({ devices: 1, delivered: 1 }),
    };
    const redis = {
      status: redisReady ? 'ready' : 'reconnecting',
      publish: jest.fn().mockResolvedValue(1),
    };
    const svc = new PlanUpdatesService(
      planModel as never,
      subModel as never,
      push as never,
      redis as never,
    );
    return { svc, push, redis, subModel, setSub: (v: unknown) => (sub = v) };
  }

  it('serves the cached plan until a change for that person is announced', async () => {
    const { svc, push, redis, subModel, setSub } = build(true);
    expect((await svc.myPlan(userId)).tier).toBe(PlanTier.PREMIUM);
    setSub(null);
    expect((await svc.myPlan(userId)).tier).toBe(PlanTier.PREMIUM);
    expect(subModel.findOne).toHaveBeenCalledTimes(1);

    await svc.announce({ userIds: [userId] });
    expect(redis.publish).toHaveBeenCalledWith(
      'ayuva:plan-changes',
      JSON.stringify({ userIds: [userId] }),
    );
    expect((await svc.myPlan(userId)).tier).toBe(PlanTier.FREE);
    await new Promise((r) => setImmediate(r));
    expect(push.send).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ data: { type: 'plan_changed' } }),
    );
  });

  it('still applies and pushes when Redis is down', async () => {
    const { svc, push, redis } = build(false);
    await svc.announce({ planId: premium._id.toString() });
    await new Promise((r) => setImmediate(r));
    expect(redis.publish).not.toHaveBeenCalled();
    expect(push.send).toHaveBeenCalledWith(userId, expect.anything());
  });
});
