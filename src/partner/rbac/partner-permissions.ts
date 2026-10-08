import { ProviderCategory } from '../../core/providers/schemas/provider.schema';

/**
 * Partner Portal RBAC. One portal serves three kinds of organisation, and a
 * member's role inside their organisation decides what they can do. The same
 * matrix drives API enforcement (PartnerPermGuard) and the portal sidebar
 * (GET /partner/me returns the effective permission list), so the two can
 * never disagree.
 */

/** What kind of organisation a partner account belongs to — derived from Provider.type. */
export enum OrgType {
  CLINIC = 'clinic',
  HOSPITAL = 'hospital',
  DIAGNOSTIC = 'diagnostic',
}

const ORG_BY_CATEGORY: Record<string, OrgType> = {
  [ProviderCategory.HOSPITAL]: OrgType.HOSPITAL,
  [ProviderCategory.DIAGNOSTIC]: OrgType.DIAGNOSTIC,
};

/** Hospital and Diagnostic map to their own portal; GP, Specialist and Physio run a clinic. */
export function orgTypeOf(category: ProviderCategory | string): OrgType {
  return ORG_BY_CATEGORY[category] ?? OrgType.CLINIC;
}

/** A member's role inside their organisation (not the platform-level UserRole). */
export enum StaffRole {
  ADMIN = 'admin',
  DOCTOR = 'doctor',
  NURSE = 'nurse',
  TECHNICIAN = 'technician',
  RECEPTIONIST = 'receptionist',
  BILLING = 'billing',
}

export enum Perm {
  DASHBOARD = 'dashboard.view',
  APPOINTMENTS_VIEW = 'appointments.view',
  APPOINTMENTS_MANAGE = 'appointments.manage',
  PATIENTS_VIEW = 'patients.view',
  // Opening patient-shared vault records. Kept separate from PATIENTS_VIEW so
  // front-desk and admin roles can work a patient list without reading clinical
  // documents (HIPAA "minimum necessary").
  RECORDS_VIEW = 'records.view',
  CLINICAL_WRITE = 'clinical.write',
  REFERRALS_VIEW = 'referrals.view',
  REFERRALS_MANAGE = 'referrals.manage',
  LAB_ORDERS_VIEW = 'lab.orders.view',
  LAB_ORDERS_MANAGE = 'lab.orders.manage',
  LAB_REPORTS_DRAFT = 'lab.reports.draft',
  LAB_REPORTS_RELEASE = 'lab.reports.release',
  LAB_CATALOG = 'lab.catalog.manage',
  LAB_INVENTORY = 'lab.inventory.manage',
  IMAGING_VIEW = 'imaging.view',
  WARDS_VIEW = 'wards.view',
  WARDS_MANAGE = 'wards.manage',
  ANALYTICS = 'analytics.view',
  BILLING_VIEW = 'billing.view',
  CLAIMS_MANAGE = 'claims.manage',
  STAFF_VIEW = 'staff.view',
  STAFF_MANAGE = 'staff.manage',
  ORG_SETTINGS = 'org.settings',
  SECURITY_AUDIT = 'security.audit',
}

const ALL = Object.values(Perm);

/** Permissions that only make sense for a given organisation type. */
const ORG_SCOPED: Partial<Record<Perm, OrgType[]>> = {
  [Perm.LAB_ORDERS_VIEW]: [OrgType.DIAGNOSTIC],
  [Perm.LAB_ORDERS_MANAGE]: [OrgType.DIAGNOSTIC],
  [Perm.LAB_REPORTS_DRAFT]: [OrgType.DIAGNOSTIC],
  [Perm.LAB_REPORTS_RELEASE]: [OrgType.DIAGNOSTIC],
  [Perm.LAB_CATALOG]: [OrgType.DIAGNOSTIC],
  [Perm.LAB_INVENTORY]: [OrgType.DIAGNOSTIC],
  [Perm.WARDS_VIEW]: [OrgType.HOSPITAL],
  [Perm.WARDS_MANAGE]: [OrgType.HOSPITAL],
  [Perm.CLAIMS_MANAGE]: [OrgType.HOSPITAL],
  // Clinicians write notes and prescriptions; a lab issues reports instead.
  [Perm.CLINICAL_WRITE]: [OrgType.CLINIC, OrgType.HOSPITAL],
};

const P = Perm;

/**
 * Role → permissions, per organisation type. Hospital and diagnostic-centre
 * admins run the organisation but do not treat patients, so they get no
 * clinical-write or shared-record access; a clinic's admin is the practising
 * doctor who owns the practice, so they get everything.
 */
const MATRIX: Record<OrgType, Record<StaffRole, Perm[]>> = {
  [OrgType.CLINIC]: {
    [StaffRole.ADMIN]: ALL,
    [StaffRole.DOCTOR]: [
      P.DASHBOARD,
      P.APPOINTMENTS_VIEW,
      P.APPOINTMENTS_MANAGE,
      P.PATIENTS_VIEW,
      P.RECORDS_VIEW,
      P.CLINICAL_WRITE,
      P.REFERRALS_VIEW,
      P.REFERRALS_MANAGE,
      P.IMAGING_VIEW,
      P.STAFF_VIEW,
    ],
    [StaffRole.NURSE]: [
      P.DASHBOARD,
      P.APPOINTMENTS_VIEW,
      P.PATIENTS_VIEW,
      P.RECORDS_VIEW,
      P.REFERRALS_VIEW,
      P.STAFF_VIEW,
    ],
    [StaffRole.RECEPTIONIST]: [
      P.DASHBOARD,
      P.APPOINTMENTS_VIEW,
      P.APPOINTMENTS_MANAGE,
      P.PATIENTS_VIEW,
      P.REFERRALS_VIEW,
      P.STAFF_VIEW,
    ],
    [StaffRole.BILLING]: [P.DASHBOARD, P.BILLING_VIEW, P.ANALYTICS],
    [StaffRole.TECHNICIAN]: [P.DASHBOARD, P.APPOINTMENTS_VIEW, P.IMAGING_VIEW],
  },
  [OrgType.HOSPITAL]: {
    [StaffRole.ADMIN]: ALL.filter(
      (p) => p !== P.CLINICAL_WRITE && p !== P.RECORDS_VIEW,
    ),
    [StaffRole.DOCTOR]: [
      P.DASHBOARD,
      P.APPOINTMENTS_VIEW,
      P.APPOINTMENTS_MANAGE,
      P.PATIENTS_VIEW,
      P.RECORDS_VIEW,
      P.CLINICAL_WRITE,
      P.REFERRALS_VIEW,
      P.REFERRALS_MANAGE,
      P.WARDS_VIEW,
      P.WARDS_MANAGE,
      P.IMAGING_VIEW,
      P.STAFF_VIEW,
    ],
    [StaffRole.NURSE]: [
      P.DASHBOARD,
      P.APPOINTMENTS_VIEW,
      P.PATIENTS_VIEW,
      P.RECORDS_VIEW,
      P.WARDS_VIEW,
      P.WARDS_MANAGE,
      P.REFERRALS_VIEW,
      P.STAFF_VIEW,
    ],
    [StaffRole.RECEPTIONIST]: [
      P.DASHBOARD,
      P.APPOINTMENTS_VIEW,
      P.APPOINTMENTS_MANAGE,
      P.PATIENTS_VIEW,
      P.WARDS_VIEW,
      P.WARDS_MANAGE,
      P.REFERRALS_VIEW,
      P.REFERRALS_MANAGE,
      P.STAFF_VIEW,
    ],
    [StaffRole.BILLING]: [
      P.DASHBOARD,
      P.BILLING_VIEW,
      P.CLAIMS_MANAGE,
      P.ANALYTICS,
      P.PATIENTS_VIEW,
    ],
    [StaffRole.TECHNICIAN]: [
      P.DASHBOARD,
      P.WARDS_VIEW,
      P.IMAGING_VIEW,
      P.STAFF_VIEW,
    ],
  },
  [OrgType.DIAGNOSTIC]: {
    [StaffRole.ADMIN]: ALL.filter((p) => p !== P.CLINICAL_WRITE),
    // Pathologist / radiologist: signs reports off.
    [StaffRole.DOCTOR]: [
      P.DASHBOARD,
      P.APPOINTMENTS_VIEW,
      P.PATIENTS_VIEW,
      P.RECORDS_VIEW,
      P.LAB_ORDERS_VIEW,
      P.LAB_REPORTS_DRAFT,
      P.LAB_REPORTS_RELEASE,
      P.IMAGING_VIEW,
      P.REFERRALS_VIEW,
      P.STAFF_VIEW,
    ],
    [StaffRole.TECHNICIAN]: [
      P.DASHBOARD,
      P.LAB_ORDERS_VIEW,
      P.LAB_ORDERS_MANAGE,
      P.LAB_REPORTS_DRAFT,
      P.LAB_INVENTORY,
      P.IMAGING_VIEW,
      P.STAFF_VIEW,
    ],
    [StaffRole.NURSE]: [
      P.DASHBOARD,
      P.LAB_ORDERS_VIEW,
      P.LAB_ORDERS_MANAGE,
      P.STAFF_VIEW,
    ],
    [StaffRole.RECEPTIONIST]: [
      P.DASHBOARD,
      P.APPOINTMENTS_VIEW,
      P.APPOINTMENTS_MANAGE,
      P.PATIENTS_VIEW,
      P.LAB_ORDERS_VIEW,
      P.LAB_ORDERS_MANAGE,
      P.REFERRALS_VIEW,
      P.REFERRALS_MANAGE,
      P.STAFF_VIEW,
    ],
    [StaffRole.BILLING]: [
      P.DASHBOARD,
      P.BILLING_VIEW,
      P.ANALYTICS,
      P.LAB_ORDERS_VIEW,
    ],
  },
};

/** Effective permissions for a role in an organisation type, with org-scoped ones filtered out. */
export function permissionsFor(orgType: OrgType, role: StaffRole): Perm[] {
  const granted = MATRIX[orgType]?.[role] ?? [];
  return granted.filter((p) => {
    const scope = ORG_SCOPED[p];
    return !scope || scope.includes(orgType);
  });
}

export function hasPerm(
  orgType: OrgType,
  role: StaffRole,
  perm: Perm,
): boolean {
  return permissionsFor(orgType, role).includes(perm);
}

/** Roles an organisation of this type can assign, in display order. */
export function assignableRoles(orgType: OrgType): StaffRole[] {
  switch (orgType) {
    case OrgType.HOSPITAL:
      return [
        StaffRole.ADMIN,
        StaffRole.DOCTOR,
        StaffRole.NURSE,
        StaffRole.RECEPTIONIST,
        StaffRole.BILLING,
        StaffRole.TECHNICIAN,
      ];
    case OrgType.DIAGNOSTIC:
      return [
        StaffRole.ADMIN,
        StaffRole.DOCTOR,
        StaffRole.TECHNICIAN,
        StaffRole.RECEPTIONIST,
        StaffRole.NURSE,
        StaffRole.BILLING,
      ];
    default:
      return [
        StaffRole.ADMIN,
        StaffRole.DOCTOR,
        StaffRole.NURSE,
        StaffRole.RECEPTIONIST,
        StaffRole.BILLING,
      ];
  }
}

/** Display labels, e.g. a diagnostic centre's "doctor" is its pathologist. */
export function roleLabel(orgType: OrgType, role: StaffRole): string {
  if (orgType === OrgType.DIAGNOSTIC && role === StaffRole.DOCTOR)
    return 'Pathologist / Radiologist';
  if (orgType === OrgType.DIAGNOSTIC && role === StaffRole.NURSE)
    return 'Phlebotomist';
  switch (role) {
    case StaffRole.ADMIN:
      return 'Administrator';
    case StaffRole.DOCTOR:
      return 'Doctor';
    case StaffRole.NURSE:
      return 'Nurse';
    case StaffRole.TECHNICIAN:
      return 'Technician';
    case StaffRole.RECEPTIONIST:
      return 'Receptionist';
    case StaffRole.BILLING:
      return 'Billing & Accounts';
  }
}
