import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProvidersService } from './providers.service';
import { ProviderStatus } from './schemas/provider.schema';

function buildService() {
  const providerModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };
  const slotModel = {
    find: jest.fn(),
  };
  const service = new ProvidersService(providerModel as any, slotModel as any);
  return { service, providerModel, slotModel };
}

const VALID_ID = new Types.ObjectId().toString();

describe('ProvidersService', () => {
  describe('findOne', () => {
    it('throws NotFoundException for a syntactically invalid id (avoids a Mongoose CastError)', async () => {
      const { service } = buildService();
      await expect(
        service.findOne('not-an-object-id', VALID_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the provider does not exist or is inactive', async () => {
      const { service, providerModel } = buildService();
      providerModel.findOne.mockResolvedValue(null);

      await expect(service.findOne(VALID_ID, VALID_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(providerModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ status: ProviderStatus.ACTIVE }),
      );
    });
  });

  describe('getSlots', () => {
    it('throws NotFoundException when the provider does not exist', async () => {
      const { service, providerModel } = buildService();
      providerModel.findOne.mockResolvedValue(null);

      await expect(
        service.getSlots(VALID_ID, '2026-08-14'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException for a malformed date string', async () => {
      const { service, providerModel } = buildService();
      providerModel.findOne.mockResolvedValue({
        id: VALID_ID,
        status: ProviderStatus.ACTIVE,
      });

      await expect(
        service.getSlots(VALID_ID, '14-08-2026'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns slots tagged with morning/afternoon period from their time', async () => {
      const { service, providerModel, slotModel } = buildService();
      providerModel.findOne.mockResolvedValue({
        id: VALID_ID,
        status: ProviderStatus.ACTIVE,
      });
      const sortMock = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { id: 's1', time: '09:00', durationMin: 30, status: 'open' },
          { id: 's2', time: '14:00', durationMin: 30, status: 'open' },
        ]),
      });
      slotModel.find.mockReturnValue({ sort: sortMock });

      const result = await service.getSlots(VALID_ID, '2026-08-14');

      expect(result).toEqual([
        expect.objectContaining({ id: 's1', period: 'morning' }),
        expect.objectContaining({ id: 's2', period: 'afternoon' }),
      ]);
    });
  });

  describe('toggleSave', () => {
    it('throws NotFoundException for an inactive provider (cannot save what patients cannot see)', async () => {
      const { service, providerModel } = buildService();
      providerModel.findOne.mockResolvedValue(null);

      await expect(
        service.toggleSave(VALID_ID, VALID_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
