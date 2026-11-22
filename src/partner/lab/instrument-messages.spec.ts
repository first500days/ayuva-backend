import { hl7Ack, parseAstm, parseHl7 } from './instrument-messages';

const HL7 = [
  '\x0bMSH|^~\\&|COBAS|LAB|AYUVA|LAB|20261105103000||ORU^R01|MSG00042|P|2.5.1',
  'PID|1||PAT123||KHAN^FARAH',
  'OBR|1||261105A1B2-1|^^^CHEM',
  'OBX|1|NM|GLU^Glucose^L||126|mg/dL|70-110|H|||F',
  'OBX|2|NM|CREA^Creatinine^L||1.1|mg/dL|0.6-1.2|N|||F',
  'OBX|3|ST|COMMENT^Note^L||||||||F',
  'OBR|2||261105A1B2-2|^^^HEM',
  'OBX|1|NM|HGB^Haemoglobin^L||13.4|g/dL|12-15.5|N|||F\x1c',
].join('\r');

const ASTM = [
  'H|\\^&|||cobas c311^1|||||||P|1',
  'P|1',
  '1O|1|261105A1B2-1||^^^GLU\\^^^CREA|R',
  'R|1|^^^GLU^Glucose|126|mg/dL|70 to 110|H||F',
  'R|2|^^^CREA|1.1|mg/dL||N||F',
  'R|3|^^^ALT||U/L||||F',
  'L|1|N',
].join('\r');

describe('analyser messages', () => {
  it('reads HL7 ORU results grouped by specimen', () => {
    const m = parseHl7(HL7);
    expect(m.controlId).toBe('MSG00042');
    expect(m.messageType).toBe('ORU^R01');
    expect(m.specimens.map((s) => s.barcode)).toEqual([
      '261105A1B2-1',
      '261105A1B2-2',
    ]);
    expect(m.specimens[0].results).toEqual([
      {
        code: 'GLU',
        name: 'Glucose',
        value: '126',
        unit: 'mg/dL',
        refRange: '70-110',
        flag: 'H',
      },
      {
        code: 'CREA',
        name: 'Creatinine',
        value: '1.1',
        unit: 'mg/dL',
        refRange: '0.6-1.2',
        flag: 'N',
      },
    ]);
    expect(m.specimens[1].results[0]).toMatchObject({
      code: 'HGB',
      value: '13.4',
    });
  });

  it('prefers the SPM specimen ID when present', () => {
    const m = parseHl7(
      'MSH|^~\\&|X|L|A|L|20261105||OUL^R22|9|P|2.5.1\rOBR|1|PLACER-9\rSPM|1|261105A1B2-7\rOBX|1|NM|K^Potassium||4.2|mmol/L',
    );
    expect(m.specimens[0].barcode).toBe('261105A1B2-7');
  });

  describe('hospital EHR / RIS reports', () => {
    const RIS = [
      'MSH|^~\\&|RIS|HOSP|AYUVA|LAB|20261108||ORU^R01|R77|P|2.5.1',
      'PID|1||MRN55^^^HOSP||KHAN^FARAH',
      'ORC|RE|ORD-991|LAB-261108-AB12',
      'OBR|1|ORD-991|ACC-5521|71020^CT Chest',
      'OBX|1|TX|IMP^Impression||No focal lesion.||||||F',
      'OBX|2|TX|IMP^Impression||Lungs clear.~Heart size normal.||||||F',
      'OBX|3|FT|IMP^Impression||Report by Dr A\\.br\\Ratio 3\\S\\4||||||F',
      'OBX|4|NM|EF^Ejection fraction||60|%|||||F',
    ].join('\r');

    it('collects every order number the message carries', () => {
      expect(parseHl7(RIS).specimens[0].orderNumbers).toEqual([
        'ORD-991',
        'LAB-261108-AB12',
        'ACC-5521',
      ]);
    });

    it('joins text lines into one report, decoding HL7 escapes and repeats', () => {
      expect(parseHl7(RIS).specimens[0].reportText).toBe(
        'No focal lesion.\nLungs clear.\nHeart size normal.\nReport by Dr A\nRatio 3^4',
      );
    });

    it('keeps numbers as results alongside the text', () => {
      expect(parseHl7(RIS).specimens[0].results).toEqual([
        expect.objectContaining({ code: 'EF', value: '60', unit: '%' }),
      ]);
    });

    it('keeps a message that has only a written report', () => {
      const m = parseHl7(
        'MSH|^~\\&|R|H|A|L|2026||ORU^R01|1|P|2.5.1\rOBR|1|P1|F1\rOBX|1|TX|N^Note||Normal study',
      );
      expect(m.specimens).toHaveLength(1);
      expect(m.specimens[0].reportText).toBe('Normal study');
      expect(m.specimens[0].results).toEqual([]);
    });

    it('leaves an unknown escape as it was', () => {
      const m = parseHl7(
        'MSH|^~\\&|R|H|A|L|2026||ORU^R01|1|P|2.5.1\rOBR|1|P1|F1\rOBX|1|TX|N^Note||a\\Z\\b',
      );
      expect(m.specimens[0].reportText).toBe('a\\Z\\b');
    });
  });

  it('reads ASTM results, ignoring frame numbers and empty values', () => {
    const m = parseAstm(ASTM);
    expect(m.protocol).toBe('astm');
    expect(m.specimens).toHaveLength(1);
    expect(m.specimens[0].barcode).toBe('261105A1B2-1');
    expect(
      m.specimens[0].results.map((r) => [r.code, r.value, r.unit, r.flag]),
    ).toEqual([
      ['GLU', '126', 'mg/dL', 'H'],
      ['CREA', '1.1', 'mg/dL', 'N'],
    ]);
    expect(m.specimens[0].results[0].name).toBe('Glucose');
  });

  it('rejects text that is not a message', () => {
    expect(() => parseHl7('hello')).toThrow(/MSH/);
    expect(() => parseAstm('hello')).toThrow(/H record/);
  });

  it('builds an HL7 acknowledgement', () => {
    const ack = hl7Ack(
      'MSG00042',
      'AA',
      'Applied 3 results',
      new Date('2026-11-05T05:00:00Z'),
    );
    expect(ack.split('\r')).toEqual([
      'MSH|^~\\&|AYUVA|LAB|||20261105050000||ACK^R01|ACKMSG00042|P|2.5.1',
      'MSA|AA|MSG00042|Applied 3 results',
    ]);
  });
});
