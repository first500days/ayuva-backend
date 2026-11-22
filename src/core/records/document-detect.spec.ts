import { detectDocument } from './document-detect';
import { MedicalRecordType } from './schemas/medical-record.schema';

const now = new Date('2026-11-05T10:00:00Z');

describe('detectDocument', () => {
  it('reads a lab report: folder, report date (not the birth date) and the lab', () => {
    const text = [
      'THYROCARE TECHNOLOGIES LTD.',
      'D-37/1, TTC MIDC, Turbhe, Navi Mumbai',
      'Patient Name : Ravi Kumar   DOB: 14/02/1980',
      'Sample Collected On: 11/10/2026 08:10   Report Date: 12/10/2026',
      'Haemoglobin 13.2 g/dL  Biological Ref. Interval 13.0 - 17.0',
      'Glucose fasting 96 mg/dL  Reference Range 70 - 100',
    ].join('\n');
    expect(detectDocument({ text, fileName: 'scan0001.pdf', now })).toEqual({
      textRead: true,
      type: { value: MedicalRecordType.LAB_REPORT, from: 'text' },
      recordDate: { value: '2026-10-12', from: 'text' },
      providerName: { value: 'Thyrocare', from: 'text' },
    });
  });

  it('reads a discharge summary from a hospital letterhead, dated on discharge', () => {
    const text = [
      'SUNRISE MULTISPECIALITY HOSPITAL, 12 MG Road, Pune - 411001 | Ph: 020-2555 1234',
      'DISCHARGE SUMMARY',
      'Date of Admission: 28-Oct-2026   Date of Discharge: 02-Nov-2026',
      'Course in hospital: uneventful. Tab Pantoprazole 40 mg OD before food.',
      'Haemoglobin 11.9 g/dL',
    ].join('\n');
    const d = detectDocument({ text, fileName: 'document.pdf', now });
    expect(d.type).toEqual({
      value: MedicalRecordType.DISCHARGE,
      from: 'text',
    });
    expect(d.recordDate).toEqual({ value: '2026-11-02', from: 'text' });
    expect(d.providerName).toEqual({
      value: 'Sunrise Multispeciality Hospital',
      from: 'text',
    });
  });

  it('reads a prescription, ignoring the follow-up date', () => {
    const text = [
      'Shree Clinic & Polyclinic',
      'Dr. A. Mehta, MBBS MD',
      'Date: 5th Nov 2026',
      'Rx',
      'Tab Metformin 500 mg 1-0-1 after food x 30 days',
      'Tab Amlodipine 5 mg 0-0-1',
      'Follow up on 05/12/2025',
    ].join('\n');
    const d = detectDocument({ text, fileName: 'IMG_4412.pdf', now });
    expect(d.type?.value).toBe(MedicalRecordType.PRESCRIPTION);
    expect(d.recordDate?.value).toBe('2026-11-05');
    expect(d.providerName?.value).toBe('Shree Clinic & Polyclinic');
  });

  it('reads a scan report', () => {
    const text =
      'Mahajan Imaging\nMRI BRAIN (PLAIN)\nStudy Date: 2026-09-30\nFindings: no acute infarct.\nIMPRESSION: Normal study.';
    const d = detectDocument({ text, fileName: 'report.pdf', now });
    expect(d.type?.value).toBe(MedicalRecordType.SCAN);
    expect(d.recordDate?.value).toBe('2026-09-30');
    expect(d.providerName?.value).toBe('Mahajan Imaging');
  });

  it('skips dates in the future and before 1950', () => {
    const text =
      'Report Date: 01/11/2026\nNext review 20/12/2026\nHaemoglobin 13 g/dL Reference Range 13-17';
    expect(
      detectDocument({ text, fileName: 'x.pdf', now }).recordDate?.value,
    ).toBe('2026-11-01');
    expect(
      detectDocument({
        text: 'Date 31/12/2027 '.repeat(3),
        fileName: 'x.pdf',
        now,
      }).recordDate,
    ).toBeUndefined();
  });

  it('makes no folder guess on generic text', () => {
    const d = detectDocument({
      text: 'Thank you for visiting. Please carry this page with you next time you come.',
      fileName: 'letter.pdf',
      now,
    });
    expect(d.textRead).toBe(true);
    expect(d.type).toBeUndefined();
    expect(d.providerName).toBeUndefined();
  });

  it('never takes patient or sample lines for the provider', () => {
    const text =
      'Patient Name: Asha Lab Services\nLab No: 88213\nSample Type: Serum Laboratory\nReference Range 3-5 mg/dL';
    expect(
      detectDocument({ text, fileName: 'x.pdf', now }).providerName,
    ).toBeUndefined();
  });

  it('falls back to the file name when there is no text (a photo)', () => {
    expect(
      detectDocument({ text: '', fileName: 'IMG-20261012-WA0003.jpg', now }),
    ).toEqual({
      textRead: false,
      recordDate: { value: '2026-10-12', from: 'filename' },
    });
    expect(
      detectDocument({ text: '', fileName: 'CBC report 03-11-2026.pdf', now }),
    ).toEqual({
      textRead: false,
      type: { value: MedicalRecordType.LAB_REPORT, from: 'filename' },
      recordDate: { value: '2026-11-03', from: 'filename' },
    });
  });
});
