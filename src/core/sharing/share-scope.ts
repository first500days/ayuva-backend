import { Types } from 'mongoose';
import type { QueryFilter } from 'mongoose';
import {
  MedicalRecordDocument,
  MedicalRecordKind,
  MedicalRecordType,
} from '../records/schemas/medical-record.schema';

/**
 * U10 "What they can see". `documents` is the original v1 scope and stays the
 * "Selected documents" option; `summary` is v1-only and behaves like it.
 */
export enum ShareScope {
  FULL = 'full',
  ROLLING_MONTHS = 'rolling_months',
  TYPES = 'types',
  DOCUMENTS = 'documents',
  /** @deprecated v1 grants only — never created any more. */
  SUMMARY = 'summary',
}

/** U10 "Duration". The v1 values 24h and 7d are still read but no longer offered. */
export enum ShareDuration {
  VISIT = 'visit',
  DAYS_30 = '30d',
  UNTIL_REVOKED = 'until_revoked',
}

export const DEFAULT_ROLLING_MONTHS = 6;

/** "This visit" stays open until a day after the appointment, so post-visit review still works. */
export const VISIT_GRACE_MS = 24 * 60 * 60 * 1000;

export interface GrantScope {
  userId: Types.ObjectId;
  scopeKind: string;
  recordIds?: string[];
  recordTypes?: string[];
  rollingMonths?: number;
}

/**
 * Builds the MedicalRecord filter for what a grant exposes *right now*.
 *
 * Every branch is pinned to the granting patient, so a record id that isn't
 * theirs can never leak through a grant. Full, rolling and types scopes are
 * live: records added after the grant are included while it is active —
 * that is what "full history" and "last 6 months" mean to the patient.
 *
 * An unknown scope matches nothing (default is no access).
 */
export function grantRecordFilter(
  grant: GrantScope,
  now: Date = new Date(),
): QueryFilter<MedicalRecordDocument> {
  const patientId = grant.userId;
  switch (grant.scopeKind) {
    case ShareScope.FULL:
      return { patientId };
    case ShareScope.ROLLING_MONTHS: {
      const cutoff = monthsBefore(now, grant.rollingMonths ?? DEFAULT_ROLLING_MONTHS);
      // Clinical date when known, upload date otherwise — the vault timeline's rule.
      return {
        patientId,
        $or: [
          { recordDate: { $gte: cutoff } },
          { recordDate: { $exists: false }, uploadedAt: { $gte: cutoff } },
        ],
      };
    }
    case ShareScope.TYPES:
      return {
        patientId,
        type: { $in: (grant.recordTypes ?? []) as MedicalRecordType[] },
        // Visit summaries hold symptom notes and belong to no folder.
        kind: { $ne: MedicalRecordKind.VISIT_SUMMARY },
      };
    case ShareScope.DOCUMENTS:
    case ShareScope.SUMMARY:
      return {
        patientId,
        _id: {
          $in: (grant.recordIds ?? [])
            .filter((id) => Types.ObjectId.isValid(id))
            .map((id) => new Types.ObjectId(id)),
        },
      };
    default:
      return { _id: { $in: [] } };
  }
}

/** Calendar months back, clamped to the target month's last day (31 Aug − 6 → 28/29 Feb). */
export function monthsBefore(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Patient-facing one-liner for a grant's scope, e.g. "Last 6 months". */
export function describeScope(grant: GrantScope): string {
  switch (grant.scopeKind) {
    case ShareScope.FULL:
      return 'Full history';
    case ShareScope.ROLLING_MONTHS:
      return `Last ${grant.rollingMonths ?? DEFAULT_ROLLING_MONTHS} months`;
    case ShareScope.TYPES:
      return `Record types: ${(grant.recordTypes ?? []).join(', ').replace(/_/g, ' ')}`;
    default: {
      const n = grant.recordIds?.length ?? 0;
      return `${n} selected document${n === 1 ? '' : 's'}`;
    }
  }
}
