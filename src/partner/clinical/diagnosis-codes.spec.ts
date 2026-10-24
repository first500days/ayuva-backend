import { BadRequestException } from '@nestjs/common';
import {
  DIAGNOSIS_CODES,
  resolveDiagnosisCodes,
  searchDiagnosisCodes,
} from './diagnosis-codes';

describe('diagnosis codes', () => {
  it('has one entry per ICD-11 code, each with a SNOMED CT id', () => {
    const codes = DIAGNOSIS_CODES.map((d) => d.icd11);
    expect(new Set(codes).size).toBe(codes.length);
    for (const d of DIAGNOSIS_CODES) {
      expect(d.icd11).toMatch(/^[0-9A-Z]{4}(\.[0-9A-Z]{1,2})?$/);
      expect(d.snomed).toMatch(/^\d{6,18}$/);
    }
  });

  it('finds conditions by name, abbreviation and lay term', () => {
    expect(searchDiagnosisCodes('hypert')[0]?.icd11).toBe('BA00');
    expect(searchDiagnosisCodes('htn')[0]?.icd11).toBe('BA00');
    expect(searchDiagnosisCodes('t2dm')[0]?.icd11).toBe('5A11');
    expect(searchDiagnosisCodes('piles')[0]?.icd11).toBe('DB60');
    expect(searchDiagnosisCodes('loose motions')[0]?.icd11).toBe('1A40');
  });

  it('finds conditions by ICD-11 code or SNOMED CT id', () => {
    expect(searchDiagnosisCodes('5A11')[0]?.icd11).toBe('5A11');
    expect(searchDiagnosisCodes('59621000')[0]?.icd11).toBe('BA00');
  });

  it('ranks names above synonym-only matches', () => {
    const results = searchDiagnosisCodes('headache').map((d) => d.icd11);
    expect(results.indexOf('8A81')).toBeLessThan(results.indexOf('8A80'));
  });

  it('returns nothing for an empty query', () => {
    expect(searchDiagnosisCodes('   ')).toEqual([]);
  });

  it('resolves chosen codes and refuses free text', () => {
    expect(resolveDiagnosisCodes(['BA00', 'BA00', '5A11'])).toEqual([
      { icd11: 'BA00', snomed: '59621000', display: 'Essential hypertension' },
      {
        icd11: '5A11',
        snomed: '44054006',
        display: 'Type 2 diabetes mellitus',
      },
    ]);
    expect(() => resolveDiagnosisCodes(['viral fever'])).toThrow(
      BadRequestException,
    );
  });
});
