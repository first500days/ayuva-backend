import { ProviderCategory } from '../../core/providers/schemas/provider.schema';
import {
  OrgType,
  Perm,
  StaffRole,
  assignableRoles,
  hasPerm,
  orgTypeOf,
  permissionsFor,
} from './partner-permissions';

describe('Partner RBAC matrix', () => {
  it('maps provider categories to organisation types', () => {
    expect(orgTypeOf(ProviderCategory.HOSPITAL)).toBe(OrgType.HOSPITAL);
    expect(orgTypeOf(ProviderCategory.DIAGNOSTIC)).toBe(OrgType.DIAGNOSTIC);
    expect(orgTypeOf(ProviderCategory.GP)).toBe(OrgType.CLINIC);
    expect(orgTypeOf(ProviderCategory.SPECIALIST)).toBe(OrgType.CLINIC);
  });

  it('gives a clinic owner (admin) the full clinical toolset', () => {
    const p = permissionsFor(OrgType.CLINIC, StaffRole.ADMIN);
    expect(p).toEqual(
      expect.arrayContaining([
        Perm.CLINICAL_WRITE,
        Perm.RECORDS_VIEW,
        Perm.STAFF_MANAGE,
        Perm.SECURITY_AUDIT,
      ]),
    );
  });

  it("keeps hospital and lab admins out of patients' clinical records (minimum necessary)", () => {
    expect(hasPerm(OrgType.HOSPITAL, StaffRole.ADMIN, Perm.RECORDS_VIEW)).toBe(
      false,
    );
    expect(
      hasPerm(OrgType.HOSPITAL, StaffRole.ADMIN, Perm.CLINICAL_WRITE),
    ).toBe(false);
    expect(
      hasPerm(OrgType.HOSPITAL, StaffRole.ADMIN, Perm.SECURITY_AUDIT),
    ).toBe(true);
    expect(
      hasPerm(OrgType.DIAGNOSTIC, StaffRole.ADMIN, Perm.CLINICAL_WRITE),
    ).toBe(false);
  });

  it('never grants module permissions outside their organisation type', () => {
    for (const role of Object.values(StaffRole)) {
      expect(hasPerm(OrgType.CLINIC, role, Perm.WARDS_VIEW)).toBe(false);
      expect(hasPerm(OrgType.CLINIC, role, Perm.LAB_ORDERS_VIEW)).toBe(false);
      expect(hasPerm(OrgType.HOSPITAL, role, Perm.LAB_CATALOG)).toBe(false);
      expect(hasPerm(OrgType.DIAGNOSTIC, role, Perm.WARDS_MANAGE)).toBe(false);
      expect(hasPerm(OrgType.DIAGNOSTIC, role, Perm.CLINICAL_WRITE)).toBe(
        false,
      );
    }
  });

  it('lets lab technicians draft but not release reports; pathologists release', () => {
    expect(
      hasPerm(OrgType.DIAGNOSTIC, StaffRole.TECHNICIAN, Perm.LAB_REPORTS_DRAFT),
    ).toBe(true);
    expect(
      hasPerm(
        OrgType.DIAGNOSTIC,
        StaffRole.TECHNICIAN,
        Perm.LAB_REPORTS_RELEASE,
      ),
    ).toBe(false);
    expect(
      hasPerm(OrgType.DIAGNOSTIC, StaffRole.DOCTOR, Perm.LAB_REPORTS_RELEASE),
    ).toBe(true);
  });

  it('keeps front desk and billing away from clinical writing', () => {
    for (const org of Object.values(OrgType)) {
      expect(hasPerm(org, StaffRole.RECEPTIONIST, Perm.CLINICAL_WRITE)).toBe(
        false,
      );
      expect(hasPerm(org, StaffRole.BILLING, Perm.CLINICAL_WRITE)).toBe(false);
      expect(hasPerm(org, StaffRole.BILLING, Perm.RECORDS_VIEW)).toBe(false);
    }
  });

  it('gives every assignable role a dashboard', () => {
    for (const org of Object.values(OrgType)) {
      for (const role of assignableRoles(org))
        expect(hasPerm(org, role, Perm.DASHBOARD)).toBe(true);
    }
  });
});
