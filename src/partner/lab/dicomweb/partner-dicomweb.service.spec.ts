import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { PartnerActor } from '../../rbac/partner-perm.guard';
import { PartnerDicomwebService } from './partner-dicomweb.service';

const provider = new Types.ObjectId();
const actor = {
  provider: { _id: provider },
  userId: 'u1',
} as unknown as PartnerActor;

const file = (sop: string, series = 'S1', study = 'ST1') => ({
  kind: 'dicom',
  studyUid: study,
  seriesUid: series,
  sopUid: sop,
  modality: 'CT',
  fileRef: `ref-${sop}`,
  fileName: `${sop}.dcm`,
  instanceNumber: 1,
  seriesNumber: 2,
  seriesDescription: 'Axial',
});
const order = (imaging: unknown[]) => ({
  orderNo: 'LAB-1',
  patientName: 'Riya',
  patientId: new Types.ObjectId(),
  imaging,
});

function build(orders: unknown[]) {
  const exec = jest.fn().mockResolvedValue(orders);
  const query = {
    exec,
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };
  const orderModel = { find: jest.fn().mockReturnValue(query) };
  const storage = { read: jest.fn().mockResolvedValue(Buffer.from('dicom')) };
  const labOrders = {
    recordImagingView: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PartnerDicomwebService(
    orderModel as never,
    storage as never,
    labOrders as never,
  );
  return { service, orderModel, storage, labOrders };
}

describe('PartnerDicomwebService', () => {
  it('only ever searches orders the organisation holds or referred', async () => {
    const { service, orderModel } = build([order([file('A')])]);
    await service.searchSeries(actor, 'ST1');
    expect(orderModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [{ providerId: provider }, { referringProviderId: provider }],
      }),
    );
  });

  it('treats another organisation’s study as not found', async () => {
    const { service } = build([]);
    await expect(service.searchSeries(actor, 'ST1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('groups a study into series with instance counts', async () => {
    const { service } = build([order([file('A'), file('B'), file('C', 'S2')])]);
    const rows = await service.searchSeries(actor, 'ST1');
    expect(rows).toHaveLength(2);
    expect(rows[0]['0020000E'].Value).toEqual(['S1']);
    expect(rows[0]['00201209'].Value).toEqual([2]);
  });

  it('lists a study once per order with its counts and modalities', async () => {
    const { service } = build([
      order([file('A'), file('B', 'S2'), { kind: 'video', studyUid: 'ST9' }]),
    ]);
    const [study] = await service.searchStudies(actor, {});
    expect(study['0020000D'].Value).toEqual(['ST1']);
    expect(study['00201206'].Value).toEqual([2]);
    expect(study['00201208'].Value).toEqual([2]);
    expect(study['00080061'].Value).toEqual(['CT']);
  });

  it('filters studies by modality, and pages them', async () => {
    const { service } = build([
      order([file('A')]),
      order([file('B', 'S1', 'ST2')]),
    ]);
    expect(
      await service.searchStudies(actor, { ModalitiesInStudy: 'mr' }),
    ).toHaveLength(0);
    expect(
      await service.searchStudies(actor, { limit: '1', offset: '1' }),
    ).toHaveLength(1);
  });

  it('narrows instances to a series and gives retrieve links', async () => {
    const { service } = build([order([file('A'), file('C', 'S2')])]);
    const rows = await service.searchInstances(actor, 'ST1', 'S2');
    expect(rows).toHaveLength(1);
    expect(rows[0]['00080018'].Value).toEqual(['C']);
    expect(String(rows[0]['00081190'].Value?.[0])).toContain(
      '/series/S2/instances/C',
    );
  });

  it('ignores query values that are objects, so they can never reach the filter', async () => {
    const { service, orderModel } = build([order([file('A')])]);
    await service.searchStudies(actor, {
      PatientID: { $ne: 'x' } as unknown as string,
      StudyInstanceUID: { $gt: '' } as unknown as string,
    });
    const filter = (
      orderModel.find.mock.calls[0] as [Record<string, unknown>]
    )[0];
    expect(filter).not.toHaveProperty('patientId');
    expect(filter).not.toHaveProperty(['imaging.studyUid']);
  });

  it('answers nothing for a malformed patient id', async () => {
    const { service, orderModel } = build([order([file('A')])]);
    expect(await service.searchStudies(actor, { PatientID: 'nope' })).toEqual(
      [],
    );
    expect(orderModel.find).not.toHaveBeenCalled();
  });

  it('reads an instance and logs the view', async () => {
    const o = order([file('A')]);
    const { service, storage, labOrders } = build([o]);
    await service.instance(actor, 'ST1', 'S1', 'A');
    expect(storage.read).toHaveBeenCalledWith('ref-A');
    expect(labOrders.recordImagingView).toHaveBeenCalledWith(actor, o, 'A.dcm');
  });

  it('will not read an instance from a different series', async () => {
    const { service, storage } = build([order([file('A')])]);
    await expect(
      service.instance(actor, 'ST1', 'WRONG', 'A'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.read).not.toHaveBeenCalled();
  });
});
