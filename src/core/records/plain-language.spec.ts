import { simplifyDocument } from './plain-language';

describe('simplifyDocument', () => {
  const lab = [
    'METROPOLIS HEALTHCARE LTD',
    'Patient Name : Neha Rao   Age : 36 Years',
    'Report Date: 02/11/2026',
    'Test Result Unit Biological Ref. Interval',
    'Haemoglobin 11.2 L g/dL 12.0 - 15.0',
    'TSH 3.1 uIU/mL 0.4 - 4.5',
    'LDL Cholesterol : 162 mg/dL 0 - 130',
    'Phone: 022 6650 5555 Age 20 - 60',
  ].join('\n');

  it('places each value against the range printed beside it', () => {
    const { values } = simplifyDocument(lab);
    expect(values).toEqual([
      {
        name: 'Haemoglobin',
        value: 11.2,
        unit: 'g/dL',
        low: 12,
        high: 15,
        position: 'below',
      },
      {
        name: 'TSH',
        value: 3.1,
        unit: 'uIU/mL',
        low: 0.4,
        high: 4.5,
        position: 'within',
      },
      {
        name: 'LDL Cholesterol',
        value: 162,
        unit: 'mg/dL',
        low: 0,
        high: 130,
        position: 'above',
      },
    ]);
  });

  it('explains the medical words the document uses, once each', () => {
    const terms = simplifyDocument(lab).terms.map((t) => t.term);
    expect(terms).toEqual(
      expect.arrayContaining([
        'Haemoglobin',
        'TSH',
        'LDL cholesterol',
        'Cholesterol',
      ]),
    );
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('reads radiology wording', () => {
    const { terms, values } = simplifyDocument(
      'CHEST X-RAY PA VIEW\nFindings: Mild cardiomegaly. No pleural effusion.\nIMPRESSION: Bilateral lung fields unremarkable.',
    );
    expect(terms.map((t) => t.term)).toEqual(
      expect.arrayContaining([
        'Impression',
        'Unremarkable',
        'Effusion',
        'Cardiomegaly',
        'Bilateral',
      ]),
    );
    expect(values).toEqual([]);
  });

  it('says so when there is no text to read', () => {
    expect(simplifyDocument('   ')).toEqual({
      textRead: false,
      terms: [],
      values: [],
    });
  });
});
