import { Types } from 'mongoose';
import { DevicesService } from './devices.service';
import { DevicePlatform } from './schemas/device-token.schema';

function buildService() {
  const deviceTokenModel = {
    findOneAndUpdate: jest.fn(),
    deleteOne: jest.fn(),
  };
  const service = new DevicesService(deviceTokenModel as any);
  return { service, deviceTokenModel };
}

const USER_ID = new Types.ObjectId().toString();

describe('DevicesService', () => {
  describe('register', () => {
    it('upserts on the token so re-registration from another user reassigns ownership', async () => {
      const { service, deviceTokenModel } = buildService();
      deviceTokenModel.findOneAndUpdate.mockResolvedValue({});

      await service.register(USER_ID, {
        token: 'fcm-token-1',
        platform: DevicePlatform.ANDROID,
      });

      expect(deviceTokenModel.findOneAndUpdate).toHaveBeenCalledWith(
        { token: 'fcm-token-1' },
        {
          $set: expect.objectContaining({ platform: DevicePlatform.ANDROID }),
        },
        expect.objectContaining({ upsert: true }),
      );
    });
  });

  describe('unregister', () => {
    it('deletes only a token owned by the caller', async () => {
      const { service, deviceTokenModel } = buildService();
      deviceTokenModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await service.unregister(USER_ID, 'fcm-token-1');

      expect(deviceTokenModel.deleteOne).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'fcm-token-1' }),
      );
    });
  });
});
