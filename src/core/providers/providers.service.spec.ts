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
  const taxonomyModel = {
    find: jest.fn(),
  };
  const service = new ProvidersService(
    providerModel as any,
    slotModel as any,
    taxonomyModel as any,
  );
  return { service, providerModel, slotModel, taxonomyModel };
}

/** Mongoose-style chain: find().select().lean().exec() / find().sort().exec(). */
function chain(result: unknown): Record<string, jest.Mock> {
  const query: Record<string, jest.Mock> = {
    exec: jest.fn().mockResolvedValue(result),
  };
  for (const step of ['select', 'lean', 'sort']) query[step] = jest.fn(() => query);
  return query;
}

const VALID_ID = new Types.ObjectId().toString();

describe('ProvidersService', () => {
  describe('findAll — marketplace category expansion', () => {
    it('widens a search to the category synonyms, mapped services and the providers offering them', async () => {
      const { service, providerModel, taxonomyModel } = buildService();
      const clinicId = new Types.ObjectId();
      taxonomyModel.find.mockReturnValue(
        chain([
          {
            name: 'Cardiology',
            synonyms: ['Cardiologist'],
            mappedServices: [{ serviceText: 'Heart Scan', entityId: clinicId }],
          },
        ]),
      );
      providerModel.find.mockReturnValue(chain([]));

      await service.findAll({ query: 'cardiology' } as any, VALID_ID);

      const filter = providerModel.find.mock.calls[0][0];
      const searchOr = filter.$and[1].$or;
      const specialtyIn = searchOr.find((m: any) => m.specialty?.$in)?.specialty.$in;
      expect(specialtyIn.map((r: RegExp) => r.source)).toEqual(
        expect.arrayContaining(['Cardiology', 'Cardiologist', 'Heart Scan']),
      );
      expect(searchOr).toContainEqual({ _id: { $in: [clinicId] } });
    });

    it('does not expand very short search text', async () => {
      const { service, providerModel, taxonomyModel } = buildService();
      providerModel.find.mockReturnValue(chain([]));

      await service.findAll({ query: 'ca' } as any, VALID_ID);

      expect(taxonomyModel.find).not.toHaveBeenCalled();
      const filter = providerModel.find.mock.calls[0][0];
      expect(filter.$and[1].$or).toHaveLength(2);
    });
  });

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
