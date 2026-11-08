import { detectDocument } from './document-detect';
import {
  MedicalRecordKind,
  MedicalRecordType,
  recordTitle,
} from './schemas/medical-record.schema';

const now = new Date('2026-11-05T10:00:00Z');
const read = (lines: string[]) => detectDocument({ text: lines.join('\n'), fileName: 'IMG-20260830-WA0008.pdf', now });

describe('procedure and doctor read from a document', () => {
  it('names a scan by modality and body part', () => {
    const d = read([
      'Clear View Imaging Centre',
      'Patient: Ravi Kumar   Referred By: Dr. Rakesh Sharma   Date: 12/10/2026',
      'MRI BRAIN PLAIN',
      'Findings: no acute abnormality. Impression: normal study.',
    ]);
    expect(d.type?.value).toBe(MedicalRecordType.SCAN);
    expect(d.procedureType).toEqual({ value: 'MRI Brain', from: 'text' });
    expect(d.attendingPhysician).toEqual({ value: 'Dr Rakesh Sharma', from: 'text' });
  });

  it('does not take the procedure from a letterhead', () => {
    const d = read([
      'City MRI & CT Centre',
      'Ultrasound Abdomen',
      'Impression: normal study. Findings: unremarkable. Radiology department',
    ]);
    expect(d.procedureType?.value).toBe('Ultrasound Abdomen');
  });

  it('names a modality alone when no body part is given', () => {
    const d = read(['X-ray report', 'Findings: clear views. Impression: normal. Radiology']);
    expect(d.procedureType?.value).toBe('X-ray');
  });

  it('names lab panels in the order they appear, then counts the rest', () => {
    const d = read([
      'Sample Collected On: 11/10/2026  Reference Range',
      'Lipid Profile',
      'Cholesterol 180 mg/dL Biological Ref. Interval 0 - 200',
      'HbA1c 5.4',
      'Liver Function',
      'Bilirubin 0.8 mg/dL',
    ]);
    expect(d.type?.value).toBe(MedicalRecordType.LAB_REPORT);
    expect(d.procedureType?.value).toBe('Lipid Profile, HbA1c +1 more');
  });

  it('stops a doctor’s name at the next field and at degrees', () => {
    expect(
      read(['Ref. By : DR. ANITA RAO MBBS MD   Sample Collected', 'Biological Ref. Interval mg/dL']).attendingPhysician?.value,
    ).toBe('Dr Anita Rao');
  });

  it('ignores "Ref by: Self" and a pathologist who only signs the report', () => {
    const d = read([
      'Ref. By : SELF',
      'Haemoglobin 13.2 g/dL Biological Ref. Interval 13 - 17',
      'Dr. Meena Iyer, MD Pathology',
    ]);
    expect(d.attendingPhysician).toBeUndefined();
  });

  it('takes the letterhead doctor on a prescription slip only', () => {
    const d = read([
      'Dr. Sunil Verma MBBS',
      'Prescription',
      'Tab Paracetamol 500 mg 1-0-1 after food x 5 days',
      'Tab Pantoprazole 40 mg 1-0-0 before food',
    ]);
    expect(d.type?.value).toBe(MedicalRecordType.PRESCRIPTION);
    expect(d.attendingPhysician?.value).toBe('Dr Sunil Verma');
  });

  it('leaves both out when a photo has no text', () => {
    const d = detectDocument({ text: '', fileName: 'IMG-20260830-WA0008.jpg', now });
    expect(d.procedureType).toBeUndefined();
    expect(d.attendingPhysician).toBeUndefined();
  });
});

describe('recordTitle', () => {
  const original = MedicalRecordKind.ORIGINAL;

  it('prefers the procedure', () => {
    expect(recordTitle({ procedureType: 'MRI Brain', type: MedicalRecordType.SCAN, kind: original })).toBe('MRI Brain');
  });

  it('falls back to what kind of document it is, never a file name', () => {
    expect(recordTitle({ type: MedicalRecordType.SCAN, kind: original })).toBe('Scan');
    expect(recordTitle({ type: MedicalRecordType.PRESCRIPTION, kind: MedicalRecordKind.VISIT_SUMMARY })).toBe('Visit summary');
    expect(recordTitle({ type: MedicalRecordType.LAB_REPORT, kind: MedicalRecordKind.SIMPLIFICATION })).toBe('Plain-language version');
  });
});
