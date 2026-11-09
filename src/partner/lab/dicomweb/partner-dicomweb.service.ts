import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StorageService } from '../../../storage/storage.service';
import { PartnerActor } from '../../rbac/partner-perm.guard';
import { PartnerLabOrdersService } from '../partner-lab-orders.service';
import {
  type LabOrderDocument,
  PartnerLabOrder,
} from '../schemas/lab-order.schema';
import {
  type DicomJson,
  type PixelFrame,
  extractFrame,
  headerOnly,
  instanceMetadata,
} from './dicom-part10';

export const DICOMWEB_ROOT = '/api/v1/partner/dicomweb';

export interface StudyQuery {
  PatientID?: string;
  StudyInstanceUID?: string;
  ModalitiesInStudy?: string;
  limit?: string;
  offset?: string;
}

type StoredFile = LabOrderDocument['imaging'][number] & {
  studyUid: string;
  seriesUid: string;
  sopUid: string;
};

const MAX_RESULTS = 200;

const ui = (v: string) => ({ vr: 'UI', Value: [v] });
const is = (v: number) => ({ vr: 'IS', Value: [v] });

/** A crafted URL can turn a query value into an object; only plain strings count. */
const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

const isDicom = (f: LabOrderDocument['imaging'][number]): f is StoredFile =>
  f.kind === 'dicom' && !!f.studyUid && !!f.seriesUid && !!f.sopUid;

/**
 * QIDO-RS and WADO-RS over the studies stored with lab orders, so a viewer
 * can find a study and pull its images on demand. An organisation sees what
 * it holds as the lab or as the referrer: the same rule as opening the files
 * one by one. Viewing is logged once per person per study per half hour.
 */
@Injectable()
export class PartnerDicomwebService {
  constructor(
    @InjectModel(PartnerLabOrder.name)
    private readonly orderModel: Model<LabOrderDocument>,
    private readonly storage: StorageService,
    private readonly orders: PartnerLabOrdersService,
  ) {}

  private visibleTo(actor: PartnerActor) {
    return {
      $or: [
        { providerId: actor.provider._id },
        { referringProviderId: actor.provider._id },
      ],
    };
  }

  private ordersWithStudy(actor: PartnerActor, study: string) {
    return this.orderModel
      .find({ ...this.visibleTo(actor), 'imaging.studyUid': study })
      .exec();
  }

  private async filesOf(actor: PartnerActor, study: string) {
    const orders = await this.ordersWithStudy(actor, study);
    const files = orders.flatMap((order) =>
      order.imaging
        .filter(isDicom)
        .filter((f) => f.studyUid === study)
        .map((file) => ({ order, file })),
    );
    if (!files.length) throw new NotFoundException('Study not found');
    return files;
  }

  async searchStudies(
    actor: PartnerActor,
    q: StudyQuery,
  ): Promise<DicomJson[]> {
    const patient = text(q.PatientID);
    const wantedStudy = text(q.StudyInstanceUID);
    const modality = text(q.ModalitiesInStudy)?.toUpperCase();
    if (patient && !Types.ObjectId.isValid(patient)) return [];
    const orders = await this.orderModel
      .find({
        ...this.visibleTo(actor),
        'imaging.0': { $exists: true },
        ...(patient && { patientId: new Types.ObjectId(patient) }),
        ...(wantedStudy && { 'imaging.studyUid': wantedStudy }),
      })
      .sort({ updatedAt: -1 })
      .limit(MAX_RESULTS)
      .exec();
    const rows: DicomJson[] = [];
    for (const order of orders) {
      const byStudy = new Map<string, StoredFile[]>();
      for (const f of order.imaging.filter(isDicom))
        byStudy.set(f.studyUid, [...(byStudy.get(f.studyUid) ?? []), f]);
      for (const [study, files] of byStudy) {
        const modalities = [
          ...new Set(files.map((f) => f.modality).filter(Boolean)),
        ] as string[];
        if (wantedStudy && study !== wantedStudy) continue;
        if (modality && !modalities.includes(modality)) continue;
        rows.push({
          '0020000D': ui(study),
          '00080050': { vr: 'SH', Value: [order.orderNo] },
          '00080061': { vr: 'CS', Value: modalities },
          '00100010': { vr: 'PN', Value: [{ Alphabetic: order.patientName }] },
          '00100020': { vr: 'LO', Value: [order.patientId.toString()] },
          '00201206': is(new Set(files.map((f) => f.seriesUid)).size),
          '00201208': is(files.length),
          '00081190': {
            vr: 'UR',
            Value: [`${DICOMWEB_ROOT}/studies/${study}`],
          },
        });
      }
    }
    const offset = Math.max(0, Number(q.offset) || 0);
    const limit = Math.min(MAX_RESULTS, Number(q.limit) || MAX_RESULTS);
    return rows.slice(offset, offset + limit);
  }

  async searchSeries(actor: PartnerActor, study: string): Promise<DicomJson[]> {
    const files = await this.filesOf(actor, study);
    const series = new Map<string, StoredFile[]>();
    for (const { file } of files)
      series.set(file.seriesUid, [...(series.get(file.seriesUid) ?? []), file]);
    return [...series].map(([uid, list]) => {
      const f = list[0];
      return {
        '0020000D': ui(study),
        '0020000E': ui(uid),
        '00080060': { vr: 'CS', Value: [f.modality ?? 'OT'] },
        ...(f.seriesNumber !== undefined && {
          '00200011': is(f.seriesNumber),
        }),
        ...(f.seriesDescription && {
          '0008103E': { vr: 'LO', Value: [f.seriesDescription] },
        }),
        '00201209': is(list.length),
      };
    });
  }

  async searchInstances(
    actor: PartnerActor,
    study: string,
    series?: string,
  ): Promise<DicomJson[]> {
    const files = (await this.filesOf(actor, study)).filter(
      ({ file }) => !series || file.seriesUid === series,
    );
    if (!files.length) throw new NotFoundException('Series not found');
    return files.map(({ file }) => ({
      '0020000D': ui(study),
      '0020000E': ui(file.seriesUid),
      '00080018': ui(file.sopUid),
      '00080060': { vr: 'CS', Value: [file.modality ?? 'OT'] },
      ...(file.instanceNumber !== undefined && {
        '00200013': is(file.instanceNumber),
      }),
      '00081190': {
        vr: 'UR',
        Value: [
          `${DICOMWEB_ROOT}/studies/${study}/series/${file.seriesUid}/instances/${file.sopUid}`,
        ],
      },
    }));
  }

  /** Reads one stored instance and logs the study view. */
  private async read(
    actor: PartnerActor,
    study: string,
    series: string,
    sop: string,
  ): Promise<Buffer> {
    const match = (await this.filesOf(actor, study)).find(
      ({ file }) => file.seriesUid === series && file.sopUid === sop,
    );
    if (!match) throw new NotFoundException('Instance not found');
    await this.orders.recordImagingView(
      actor,
      match.order,
      match.file.fileName,
    );
    return this.storage.read(match.file.fileRef);
  }

  instance(actor: PartnerActor, study: string, series: string, sop: string) {
    return this.read(actor, study, series, sop);
  }

  async header(
    actor: PartnerActor,
    study: string,
    series: string,
    sop: string,
  ): Promise<Buffer> {
    return headerOnly(await this.read(actor, study, series, sop));
  }

  async metadata(
    actor: PartnerActor,
    study: string,
    series: string,
    sop: string,
  ): Promise<DicomJson[]> {
    return [instanceMetadata(await this.read(actor, study, series, sop))];
  }

  async seriesMetadata(
    actor: PartnerActor,
    study: string,
    series: string,
  ): Promise<DicomJson[]> {
    const files = (await this.filesOf(actor, study)).filter(
      ({ file }) => file.seriesUid === series,
    );
    if (!files.length) throw new NotFoundException('Series not found');
    await this.orders.recordImagingView(
      actor,
      files[0].order,
      files[0].file.fileName,
    );
    const out: DicomJson[] = [];
    for (const { file } of files)
      out.push(instanceMetadata(await this.storage.read(file.fileRef)));
    return out;
  }

  async frames(
    actor: PartnerActor,
    study: string,
    series: string,
    sop: string,
    numbers: number[],
  ): Promise<PixelFrame[]> {
    const buffer = await this.read(actor, study, series, sop);
    const frames = numbers.map((n) => extractFrame(buffer, n));
    if (!frames.length || frames.some((f) => f === null))
      throw new NotFoundException('Frame not found');
    return frames as PixelFrame[];
  }
}
