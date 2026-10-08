import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MedicalRecord,
  MedicalRecordDocument,
  MedicalRecordKind,
  MedicalRecordType,
} from '../../core/records/schemas/medical-record.schema';
import { ProviderDocument } from '../../core/providers/schemas/provider.schema';
import { StorageService } from '../../storage/storage.service';
import { AppNotificationsService } from '../../notifications/app-notifications.service';
import { PdfBuilder, Rgb } from '../../common/pdf/simple-pdf';
import {
  PrescriptionDocument,
  PrescriptionStatus,
} from '../clinical/schemas/prescription.schema';
import { ConsultationNoteDocument } from '../clinical/schemas/consultation-note.schema';
import { LabOrderDocument } from '../lab/schemas/lab-order.schema';
import { LabResultDocument } from '../lab/schemas/lab-result.schema';
import { AdmissionDocument } from '../hospital/schemas/admission.schema';
import { ReferralDocument } from '../referrals/schemas/referral.schema';

export interface VaultDelivery {
  patientId: Types.ObjectId | string;
  buffer: Buffer;
  fileName: string;
  mimeType?: string;
  type: MedicalRecordType;
  providerName: string;
  recordDate?: Date;
  tags?: string[];
  appointmentId?: Types.ObjectId | string;
  notification: {
    trigger: string;
    title: string;
    message: string;
    lockScreenText: string;
  };
}

const fmtDate = (d?: Date | null) =>
  d
    ? d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';
const fmtDateTime = (d?: Date | null) =>
  d
    ? `${fmtDate(d)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
    : '—';

/**
 * Clinical documents a partner sends to a patient: renders the PDF and files
 * it in the patient's Medical Vault (encrypted like any upload), then posts
 * the in-app notification. The vault is the patient's, so these records are
 * fully under the patient's control afterwards (share, delete, download).
 */
@Injectable()
export class PartnerDocumentsService {
  private readonly logger = new Logger(PartnerDocumentsService.name);

  constructor(
    @InjectModel(MedicalRecord.name)
    private readonly recordModel: Model<MedicalRecordDocument>,
    private readonly storage: StorageService,
    private readonly notifications: AppNotificationsService,
  ) {}

  async deliverToVault(d: VaultDelivery): Promise<MedicalRecordDocument> {
    const patientId = d.patientId.toString();
    const fileRef = await this.storage.upload(d.buffer, d.fileName, patientId);
    const record = await this.recordModel.create({
      patientId: new Types.ObjectId(patientId),
      fileRef,
      originalFileName: d.fileName,
      mimeType: d.mimeType ?? 'application/pdf',
      type: d.type,
      kind: MedicalRecordKind.ORIGINAL,
      providerName: d.providerName,
      recordDate: d.recordDate ?? new Date(),
      tags: d.tags ?? [],
      ...(d.appointmentId && {
        attachedAppointmentId: new Types.ObjectId(d.appointmentId.toString()),
      }),
    });
    await this.notifications
      .create(patientId, {
        ...d.notification,
        category: 'documents',
        actionLabel: 'Open',
        actionRoute: '/record/[id]',
        actionParams: { id: record.id },
      })
      .catch((err: unknown) =>
        this.logger.error(
          `Vault notification failed for ${record.id}`,
          err as Error,
        ),
      );
    return record;
  }

  /** Tags a delivered vault record (e.g. "cancelled") without touching the patient's file. */
  async tagVaultRecord(recordId: Types.ObjectId | undefined, tag: string) {
    if (!recordId) return;
    await this.recordModel
      .updateOne({ _id: recordId }, { $addToSet: { tags: tag } })
      .exec();
  }

  // ── Renderers ─────────────────────────────────────────────────────────────

  prescriptionPdf(
    rx: PrescriptionDocument,
    provider: ProviderDocument,
  ): Buffer {
    const draft = rx.status === PrescriptionStatus.DRAFT;
    const pdf = new PdfBuilder({
      title: `Prescription ${rx.rxNumber ?? '(draft)'}`,
    }).banner(
      provider.name,
      [this.address(provider), provider.phone].filter(Boolean).join(' · ') ||
        'Ayuva partner',
      rx.rxNumber ?? 'DRAFT',
    );
    if (draft)
      pdf.text('DRAFT — not signed, not valid for dispensing', {
        font: 'bold',
        color: [0.75, 0.2, 0.15],
      });
    if (rx.status === PrescriptionStatus.CANCELLED) {
      pdf.text(
        `CANCELLED on ${fmtDate(rx.cancelledAt)}${rx.cancelReason ? ` — ${rx.cancelReason}` : ''}`,
        {
          font: 'bold',
          color: [0.75, 0.2, 0.15],
        },
      );
    }
    pdf.keyValues(
      [
        ['Patient', rx.patientName],
        ['Date', fmtDate(rx.signedAt ?? rx.createdAt)],
        [
          'Prescriber',
          [rx.doctorName, rx.doctorTitle].filter(Boolean).join(', '),
        ],
        ['Registration no.', rx.doctorRegistrationNumber ?? '—'],
      ],
      2,
    );
    if (rx.diagnosis) pdf.heading('Clinical notes').text(rx.diagnosis);
    pdf.heading('Rx');
    pdf.table(
      [
        { header: '#', width: 0.05 },
        { header: 'Medicine', width: 0.35 },
        { header: 'Dose & frequency', width: 0.24 },
        { header: 'Duration', width: 0.13 },
        { header: 'Instructions', width: 0.23 },
      ],
      rx.items.map((it, i) => [
        String(i + 1),
        [it.form, it.medicine, it.strength].filter(Boolean).join(' '),
        [it.dose, it.frequency, it.route].filter(Boolean).join(' · '),
        it.duration,
        [it.instructions, it.quantity ? `Qty ${it.quantity}` : '']
          .filter(Boolean)
          .join(' · '),
      ]),
    );
    if (rx.investigations.length)
      pdf.heading('Investigations advised').text(rx.investigations.join(', '));
    if (rx.advice) pdf.heading('Advice').text(rx.advice);
    if (rx.followUpDate)
      pdf.heading('Follow-up').text(`Review on ${fmtDate(rx.followUpDate)}`);
    if (!draft) {
      pdf.signature([
        rx.doctorName,
        rx.doctorRegistrationNumber
          ? `Reg. ${rx.doctorRegistrationNumber}`
          : 'Registered medical practitioner',
        `Digitally signed ${fmtDateTime(rx.signedAt)}`,
        `Verification hash ${rx.signatureHash?.slice(0, 16) ?? ''}`,
      ]);
    }
    return pdf
      .footer(
        'Issued via Ayuva Partner Portal. Medicines are entered by the prescribing doctor; Ayuva does not recommend treatment.',
      )
      .build();
  }

  visitSummaryPdf(
    note: ConsultationNoteDocument,
    provider: ProviderDocument,
  ): Buffer {
    const s = note.sections;
    const pdf = new PdfBuilder({ title: 'Visit summary' })
      .banner(
        provider.name,
        'Consultation summary',
        fmtDate(note.signedAt ?? note.createdAt),
      )
      .keyValues(
        [
          ['Patient', note.patientName],
          ['Doctor', note.authorName],
        ],
        2,
      );
    const vitals = Object.entries(note.vitals ?? {})
      .filter(([, v]) => typeof v === 'string' && v)
      .map(([k, v]) => `${VITAL_LABELS[k] ?? k}: ${v}`);
    const block = (title: string, body?: string) => {
      if (body && body.trim()) pdf.heading(title).text(body);
    };
    block('Reason for visit', s.chiefComplaint);
    block('History', s.history);
    if (vitals.length) pdf.heading('Vitals').text(vitals.join('   ·   '));
    block('Examination', s.examination);
    block("Doctor's assessment", s.assessment);
    block('Plan', s.plan);
    block('Advice', s.advice);
    block('Follow-up', s.followUp);
    pdf.signature([note.authorName, `Signed ${fmtDateTime(note.signedAt)}`]);
    return pdf
      .footer(
        'Written and signed by your doctor. Bring questions to your doctor; Ayuva does not give medical advice.',
      )
      .build();
  }

  labReportPdf(
    order: LabOrderDocument,
    result: LabResultDocument,
    provider: ProviderDocument,
  ): Buffer {
    const pdf = new PdfBuilder({ title: `Lab report ${order.orderNo}` })
      .banner(
        provider.name,
        [this.address(provider), provider.phone].filter(Boolean).join(' · ') ||
          'Diagnostic report',
        order.orderNo,
      )
      .keyValues(
        [
          ['Patient', order.patientName],
          [
            'Collected',
            fmtDateTime(order.sampleCollection?.collectedAt ?? order.createdAt),
          ],
          [
            'Referred by',
            order.referringDoctorName ?? order.referringProviderName ?? 'Self',
          ],
          ['Reported', fmtDateTime(result.releasedAt ?? new Date())],
        ],
        2,
      );
    if (result.status !== 'released')
      pdf.text('PRELIMINARY — not yet released', {
        font: 'bold',
        color: [0.75, 0.2, 0.15],
      });
    for (const test of result.tests) {
      pdf.heading(test.name, 11);
      const rowColors: (Rgb | null)[] = test.values.map((v) =>
        v.flag.startsWith('critical')
          ? [0.99, 0.88, 0.86]
          : v.flag === 'high' || v.flag === 'low' || v.flag === 'abnormal'
            ? [1, 0.96, 0.88]
            : null,
      );
      pdf.table(
        [
          { header: 'Parameter', width: 0.3 },
          { header: 'Result', width: 0.16, align: 'right' },
          { header: 'Unit', width: 0.14 },
          { header: 'Reference', width: 0.22 },
          { header: 'Flag', width: 0.18 },
        ],
        test.values.map((v) => [
          v.name,
          v.value || '—',
          v.unit ?? '',
          refRange(v),
          FLAG_LABELS[v.flag] ?? '',
        ]),
        { rowColors },
      );
    }
    if (result.comments) pdf.heading('Comments').text(result.comments);
    if (result.status === 'released') {
      pdf.signature([
        result.releasedByName ?? 'Authorised signatory',
        'Released for patient record',
        fmtDateTime(result.releasedAt),
      ]);
    }
    return pdf
      .footer(
        'Reference intervals are those used by the reporting laboratory. Interpretation is for your doctor.',
      )
      .build();
  }

  dischargeSummaryPdf(
    a: AdmissionDocument,
    provider: ProviderDocument,
  ): Buffer {
    const pdf = new PdfBuilder({ title: `Discharge summary ${a.admissionNo}` })
      .banner(provider.name, 'Discharge summary', a.admissionNo)
      .keyValues(
        [
          ['Patient', a.patientName],
          ['Department', a.department ?? '—'],
          ['Admitted', fmtDateTime(a.admittedAt)],
          ['Discharged', fmtDateTime(a.dischargedAt)],
          ['Attending doctor', a.attendingName ?? '—'],
          [
            'Discharge type',
            DISCHARGE_LABELS[a.dischargeType ?? 'routine'] ??
              a.dischargeType ??
              '—',
          ],
        ],
        2,
      );
    if (a.reason) pdf.heading('Reason for admission').text(a.reason);
    if (a.transfers.length) {
      pdf.heading('Ward transfers').table(
        [
          { header: 'When', width: 0.28 },
          { header: 'From', width: 0.26 },
          { header: 'To', width: 0.26 },
          { header: 'Reason', width: 0.2 },
        ],
        a.transfers.map((t) => [
          fmtDateTime(t.at),
          `${t.fromWardName} / ${t.fromBedLabel}`,
          `${t.toWardName} / ${t.toBedLabel}`,
          t.reason ?? '',
        ]),
      );
    }
    if (a.dischargeNote) pdf.heading('Discharge notes').text(a.dischargeNote);
    pdf.signature([
      a.attendingName ?? provider.name,
      `Discharged ${fmtDate(a.dischargedAt)}`,
    ]);
    return pdf
      .footer('Issued by the treating hospital via Ayuva Partner Portal.')
      .build();
  }

  referralLetterPdf(r: ReferralDocument, provider: ProviderDocument): Buffer {
    const pdf = new PdfBuilder({ title: `Referral ${r.referralNo}` })
      .banner(provider.name, 'Referral letter', r.referralNo)
      .keyValues(
        [
          ['Patient', r.patientName],
          ['Date', fmtDate(r.createdAt)],
          ['Referred to', r.toName],
          ['Priority', r.priority.toUpperCase()],
          ['Referral type', r.type.replace('_', ' ')],
          ['Department', r.department ?? '—'],
        ],
        2,
      )
      .heading('Reason for referral')
      .text(r.reason);
    if (r.clinicalSummary)
      pdf.heading('Clinical summary').text(r.clinicalSummary);
    if (r.requestedTests.length)
      pdf.heading('Tests requested').text(r.requestedTests.join(', '));
    pdf.signature([r.fromName, provider.name, fmtDate(r.createdAt)]);
    return pdf
      .footer(
        'Records are shared only with the patient’s consent through their Ayuva Medical Vault.',
      )
      .build();
  }

  private address(p: ProviderDocument): string {
    return p.locations?.[0]?.address ?? '';
  }
}

const VITAL_LABELS: Record<string, string> = {
  bp: 'BP',
  pulse: 'Pulse',
  temperature: 'Temp',
  spo2: 'SpO2',
  respiratoryRate: 'RR',
  weight: 'Weight',
  height: 'Height',
};

const FLAG_LABELS: Record<string, string> = {
  normal: '',
  none: '',
  low: 'Low',
  high: 'High',
  abnormal: 'Abnormal',
  critical_low: 'Critical low',
  critical_high: 'Critical high',
};

const DISCHARGE_LABELS: Record<string, string> = {
  routine: 'Routine discharge',
  lama: 'Left against medical advice',
  referred: 'Referred to another facility',
  deceased: 'Deceased',
};

function refRange(v: {
  refLow?: number;
  refHigh?: number;
  refText?: string;
}): string {
  if (v.refText) return v.refText;
  if (v.refLow !== undefined && v.refHigh !== undefined)
    return `${v.refLow} – ${v.refHigh}`;
  if (v.refLow !== undefined) return `> ${v.refLow}`;
  if (v.refHigh !== undefined) return `< ${v.refHigh}`;
  return '';
}
