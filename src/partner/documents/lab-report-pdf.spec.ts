import { PartnerDocumentsService } from './partner-documents.service';

/** The lab report PDF is plain (uncompressed) PDF text, so its words can be searched. */
describe('lab report PDF', () => {
  const docs = new PartnerDocumentsService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
  const order = {
    orderNo: 'LAB-261105-T1A1',
    patientName: 'Anita Desai',
    items: [],
    sampleCollection: {
      type: 'lab',
      collectedAt: new Date('2026-11-05T04:00:00Z'),
    },
    createdAt: new Date('2026-11-05T04:00:00Z'),
    referringDoctorName: null,
  } as never;
  const result = {
    status: 'released',
    releasedAt: new Date('2026-11-05T06:00:00Z'),
    releasedByName: 'Dr Path Iyer',
    comments: '',
    tests: [
      {
        name: 'Diabetes panel',
        values: [
          {
            name: 'HbA1c',
            value: '6.8',
            unit: '%',
            refLow: 4,
            refHigh: 5.6,
            flag: 'high',
          },
        ],
      },
    ],
  } as never;
  const provider = {
    name: 'Trend Diagnostics',
    phone: '+918040002222',
  } as never;
  const url =
    'https://ayuva.example/r/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ab';

  it('prints the results-over-time link when there is one', () => {
    const text = docs
      .labReportPdf(order, result, provider, url)
      .toString('latin1');
    expect(text).toContain('(YOUR RESULTS OVER TIME)');
    expect(text).toContain(url);
    // The sentence wraps across lines; check its key words.
    expect(text).toMatch(/quick/);
    expect(text).toMatch(/90 days/);
  });

  it('leaves it out when there is none (e.g. no way to protect the link)', () => {
    const text = docs.labReportPdf(order, result, provider).toString('latin1');
    expect(text).not.toContain('YOUR RESULTS OVER TIME');
  });
  it('ends with the clinician-validation disclaimer', () => {
    const text = docs.labReportPdf(order, result, provider).toString('latin1');
    // Wrapped across lines; check its distinctive words.
    expect(text).toMatch(/operational support gateway/);
    expect(text).toMatch(/human clinician validation/);
  });
});
