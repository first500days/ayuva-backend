import { Types } from 'mongoose';
import { RxRefillService } from './rx-refill.service';

const exec = (v: unknown) => ({ exec: () => Promise.resolve(v) });

describe('RxRefillService.sweep', () => {
  const patientId = new Types.ObjectId();
  const providerId = new Types.ObjectId();
  const prompt = {
    _id: new Types.ObjectId(),
    prescriptionId: new Types.ObjectId(),
    patientId,
    providerId,
  };

  function build({ claimed = 1, booked = false } = {}) {
    const promptModel = {
      find: jest.fn((q: Record<string, unknown>) =>
        'promptAt' in q
          ? { limit: () => exec([prompt]) }
          : { select: () => ({ lean: () => exec([]) }) },
      ),
      updateOne: jest.fn(() => exec({ modifiedCount: claimed })),
    };
    const rxModel = {
      find: jest.fn(() => ({ limit: () => exec([]) })),
      findById: jest.fn(() => ({
        select: () => ({
          lean: () =>
            exec({ status: 'signed', signedAt: new Date('2026-11-01') }),
        }),
      })),
    };
    const appointmentModel = {
      exists: jest.fn(() => Promise.resolve(booked ? { _id: 1 } : null)),
    };
    const push = {
      send: jest.fn().mockResolvedValue({ devices: 1, delivered: 1 }),
    };
    const svc = new RxRefillService(
      rxModel as never,
      promptModel as never,
      appointmentModel as never,
      push as never,
    );
    return { svc, push, promptModel };
  }

  it('pushes a due prompt once, without naming the medicine', async () => {
    const { svc, push } = build();
    expect(await svc.sweep()).toBe(1);
    expect(push.send).toHaveBeenCalledWith(
      patientId.toString(),
      expect.objectContaining({
        title: 'Your prescription is nearly finished',
        data: expect.objectContaining({
          type: 'rx_refill',
          providerId: providerId.toString(),
        }),
      }),
    );
  });

  it('skips a patient who already booked a follow-up', async () => {
    const { svc, push, promptModel } = build({ booked: true });
    expect(await svc.sweep()).toBe(0);
    expect(push.send).not.toHaveBeenCalled();
    expect(promptModel.updateOne).toHaveBeenLastCalledWith(
      { _id: prompt._id },
      { $set: { skipped: 'follow-up booked' } },
    );
  });

  it('leaves a prompt another instance claimed', async () => {
    const { svc, push } = build({ claimed: 0 });
    expect(await svc.sweep()).toBe(0);
    expect(push.send).not.toHaveBeenCalled();
  });
});
