import {
  explainScan,
  measurementsIn,
  reportSections,
  SCAN_EXPLANATION_DISCLAIMER,
} from './scan-explainer';

const REPORT = `MRI LUMBAR SPINE
FINDINGS:
Mild degenerative changes at L4-L5 with a disc bulge measuring 3.5 mm.
No fracture. Spinal canal is unremarkable.
IMPRESSION:
Mild L4-L5 disc bulge without stenosis. Clinical correlation advised.`;

describe('scan explainer', () => {
  it('splits a report into its headed sections', () => {
    const s = reportSections(REPORT);
    expect(s.impression).toBe(
      'Mild L4-L5 disc bulge without stenosis. Clinical correlation advised.',
    );
    expect(s.findings).toContain('3.5 mm');
  });

  it('finds sizes', () => {
    expect(
      measurementsIn('A 12 x 8 mm nodule and a 1.4 cm cyst; 12 x 8 mm again'),
    ).toEqual(['12 × 8 mm', '1.4 cm']);
  });

  it('quotes the conclusion, explains terms, adds the doctor note and always carries the disclaimer', () => {
    const e = explainScan({
      procedureType: 'MRI Lumbar Spine',
      providerName: 'City Imaging',
      date: new Date('2026-11-01T09:00:00Z'),
      reportText: REPORT,
      note: {
        doctor: 'Dr Rao',
        signedAt: new Date('2026-11-03T09:00:00Z'),
        plan: 'Physiotherapy for 6 weeks.',
      },
    });
    const conclusion = e.sections.find(
      (s) => s.quoted && s.heading.startsWith('The radiologist'),
    );
    expect(conclusion?.body).toBe(
      'Mild L4-L5 disc bulge without stenosis. Clinical correlation advised.',
    );
    expect(e.terms.map((t) => t.term)).toEqual(
      expect.arrayContaining([
        'Unremarkable',
        'Degenerative changes',
        'Stenosis',
        'Disc bulge / herniation',
        'Clinical correlation',
      ]),
    );
    expect(
      e.sections.some(
        (s) =>
          s.heading === 'What Dr Rao wrote after it' &&
          s.body.includes('Physiotherapy'),
      ),
    ).toBe(true);
    expect(e.measurements).toEqual(['3.5 mm']);
    expect(e.disclaimer).toBe(SCAN_EXPLANATION_DISCLAIMER);
    expect(e.generatedBy).toBe('rules');
  });

  it('says so plainly when there is no text to read', () => {
    const e = explainScan({ procedureType: 'X-ray Chest', reportText: '' });
    expect(e.textRead).toBe(false);
    expect(e.sections[1].heading).toBe('We couldn’t read this report');
    expect(e.terms).toEqual([]);
  });
});
