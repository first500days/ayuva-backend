import { Types } from 'mongoose';
import { MedicalRecordKind } from '../records/schemas/medical-record.schema';
import {
  describeScope,
  grantRecordFilter,
  monthsBefore,
  ShareScope,
} from './share-scope';

const patientId = new Types.ObjectId();
const NOW = new Date('2026-10-02T10:00:00.000Z');

describe('grantRecordFilter (U10 scopes)', () => {
  it('full history: every record of the granting patient', () => {
    expect(grantRecordFilter({ userId: patientId, scopeKind: ShareScope.FULL })).toEqual({
      patientId,
    });
  });

  it('last N months: rolling window on clinical date, upload date as fallback', () => {
    const filter = grantRecordFilter(
      { userId: patientId, scopeKind: ShareScope.ROLLING_MONTHS, rollingMonths: 6 },
      NOW,
    );
    const cutoff = new Date('2026-04-02T10:00:00.000Z');
    expect(filter).toEqual({
      patientId,
      $or: [
        { recordDate: { $gte: cutoff } },
        { recordDate: { $exists: false }, uploadedAt: { $gte: cutoff } },
      ],
    });
  });

  it('rolling window defaults to 6 months', () => {
    const filter = grantRecordFilter(
      { userId: patientId, scopeKind: ShareScope.ROLLING_MONTHS },
      NOW,
    ) as { $or: Array<{ recordDate?: { $gte: Date } }> };
    expect(filter.$or[0].recordDate?.$gte.toISOString()).toBe('2026-04-02T10:00:00.000Z');
  });

  it('record types: selected folders, never visit summaries', () => {
    expect(
      grantRecordFilter({
        userId: patientId,
        scopeKind: ShareScope.TYPES,
        recordTypes: ['lab_report', 'scan'],
      }),
    ).toEqual({
      patientId,
      type: { $in: ['lab_report', 'scan'] },
      kind: { $ne: MedicalRecordKind.VISIT_SUMMARY },
    });
  });

  it('selected documents: only listed ids, still pinned to the patient, junk ids dropped', () => {
    const id = new Types.ObjectId();
    expect(
      grantRecordFilter({
        userId: patientId,
        scopeKind: ShareScope.DOCUMENTS,
        recordIds: [id.toString(), 'not-an-id'],
      }),
    ).toEqual({ patientId, _id: { $in: [id] } });
  });

  it('v1 summary grants behave like selected documents', () => {
    const id = new Types.ObjectId();
    expect(
      grantRecordFilter({
        userId: patientId,
        scopeKind: ShareScope.SUMMARY,
        recordIds: [id.toString()],
      }),
    ).toEqual({ patientId, _id: { $in: [id] } });
  });

  it('an unknown scope matches nothing', () => {
    expect(grantRecordFilter({ userId: patientId, scopeKind: 'everything' })).toEqual({
      _id: { $in: [] },
    });
  });
});

describe('monthsBefore', () => {
  it('clamps to the end of a shorter month', () => {
    expect(monthsBefore(new Date('2026-08-31T00:00:00Z'), 6).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('crosses a year boundary', () => {
    expect(monthsBefore(new Date('2026-03-15T00:00:00Z'), 6).toISOString()).toBe(
      '2025-09-15T00:00:00.000Z',
    );
  });
});

describe('describeScope', () => {
  it.each([
    [{ scopeKind: ShareScope.FULL }, 'Full history'],
    [{ scopeKind: ShareScope.ROLLING_MONTHS, rollingMonths: 6 }, 'Last 6 months'],
    [{ scopeKind: ShareScope.TYPES, recordTypes: ['lab_report'] }, 'Record types: lab report'],
    [{ scopeKind: ShareScope.DOCUMENTS, recordIds: ['a'] }, '1 selected document'],
  ])('%j → %s', (grant, label) => {
    expect(describeScope({ userId: patientId, ...grant })).toBe(label);
  });
});
