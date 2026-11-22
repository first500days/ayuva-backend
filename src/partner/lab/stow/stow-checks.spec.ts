import {
  checkPatient,
  dicomDate,
  readPushedHeader,
  stowResponse,
} from './stow-checks';
import { dicomFile } from './test-dicom';

describe('readPushedHeader', () => {
  it('reads the identifiers that route an image', () => {
    const h = readPushedHeader(
      dicomFile({
        accession: 'LAB-261108-AB12',
        patientName: 'KHAN^FARAH',
        birthDate: '19800214',
        sop: '1.2.3.4',
      }),
    );
    expect(h).toEqual({
      sopClassUid: '1.2.840.10008.5.1.4.1.1.2',
      sopInstanceUid: '1.2.3.4',
      studyUid: '1.2.3',
      accession: 'LAB-261108-AB12',
      patientName: 'KHAN^FARAH',
      birthDate: '19800214',
    });
  });

  it('turns away anything that is not DICOM', () => {
    expect(readPushedHeader(Buffer.from('hello'))).toBeNull();
    expect(readPushedHeader(Buffer.alloc(200))).toBeNull();
  });
});

describe('checkPatient', () => {
  const order = (name: string, birthDate: string | null = null) => ({ name, birthDate });

  it.each([
    ['KHAN^FARAH', 'Farah Khan'],
    ['KHAN^FARAH^A', 'Farah Khan'],
    ['Khan^Farah', 'Dr. Farah  Khan'],
    ['SHARMA^RAVI^KUMAR', 'Ravi Kumar Sharma'],
  ])('matches %s with %s', (scan, name) => {
    expect(checkPatient({ name: scan, birthDate: null }, order(name))).toBe('match');
  });

  it('refuses a different person', () => {
    expect(
      checkPatient({ name: 'KHAN^AYESHA', birthDate: null }, order('Farah Khan')),
    ).toBe('mismatch');
  });

  it('refuses when the birth dates differ, whatever the name', () => {
    expect(
      checkPatient(
        { name: 'KHAN^FARAH', birthDate: '19800214' },
        order('Farah Khan', '19800215'),
      ),
    ).toBe('mismatch');
  });

  it('holds one shared word back unless the birth date confirms it', () => {
    const scan = { name: 'KUMAR^RAMESH', birthDate: '19700101' };
    expect(checkPatient({ ...scan, birthDate: null }, order('Ramesh'))).toBe('unknown');
    expect(checkPatient(scan, order('Ramesh', '19700101'))).toBe('match');
  });

  it('accepts single names that agree', () => {
    expect(checkPatient({ name: 'RAMESH', birthDate: null }, order('Ramesh'))).toBe(
      'match',
    );
  });

  it('cannot check an anonymised scan', () => {
    expect(checkPatient({ name: null, birthDate: null }, order('Farah Khan'))).toBe(
      'unknown',
    );
    expect(checkPatient({ name: '^', birthDate: null }, order('Farah Khan'))).toBe(
      'unknown',
    );
  });

  it('reads names in other scripts', () => {
    expect(
      checkPatient({ name: 'शर्मा^रवि', birthDate: null }, order('रवि शर्मा')),
    ).toBe('match');
  });

  it('uses the first form of a multi-script DICOM name', () => {
    expect(
      checkPatient({ name: 'YAMADA^TARO=山田^太郎', birthDate: null }, order('Taro Yamada')),
    ).toBe('match');
  });
});

describe('dicomDate', () => {
  it('formats a stored date of birth', () => {
    expect(dicomDate(new Date('1980-02-14T00:00:00Z'))).toBe('19800214');
    expect(dicomDate(null)).toBeNull();
    expect(dicomDate(new Date('nope'))).toBeNull();
  });
});

describe('stowResponse', () => {
  const ok = { sopClassUid: '1.2', sopInstanceUid: '9.1' };
  const bad = { sopClassUid: null, sopInstanceUid: '9.2', reason: 0x0110 };

  it('is 200 when everything was stored', () => {
    const r = stowResponse({ stored: [ok], failed: [] });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      '00081199': {
        vr: 'SQ',
        Value: [
          {
            '00081150': { vr: 'UI', Value: ['1.2'] },
            '00081155': { vr: 'UI', Value: ['9.1'] },
          },
        ],
      },
    });
  });

  it('is 202 with the failures listed when some were refused', () => {
    const r = stowResponse({ stored: [ok], failed: [bad] });
    expect(r.status).toBe(202);
    expect(r.body['00081198']).toEqual({
      vr: 'SQ',
      Value: [
        {
          '00081150': { vr: 'UI' },
          '00081155': { vr: 'UI', Value: ['9.2'] },
          '00081197': { vr: 'US', Value: [0x0110] },
        },
      ],
    });
  });

  it('is 409 when nothing was stored', () => {
    expect(stowResponse({ stored: [], failed: [bad] }).status).toBe(409);
  });
});
