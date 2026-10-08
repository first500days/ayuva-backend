import { OrgType, StaffRole } from '../rbac/partner-permissions';

/** Events a partner organisation can be notified about (Notification Center). */
export enum PartnerTrigger {
  NEW_BOOKING = 'new_booking',
  BOOKING_CHANGED = 'booking_changed',
  RECORDS_SHARED = 'records_shared',
  REFERRAL_RECEIVED = 'referral_received',
  REFERRAL_UPDATED = 'referral_updated',
  LAB_ORDER_RECEIVED = 'lab_order_received',
  LAB_RESULT_READY = 'lab_result_ready',
  CRITICAL_LAB_RESULT = 'critical_lab_result',
  ADMISSION_UPDATE = 'admission_update',
  STAFF_JOINED = 'staff_joined',
}

export type PartnerChannel = 'inApp' | 'email' | 'sms' | 'desktop' | 'webhook';
export const PARTNER_CHANNELS: PartnerChannel[] = [
  'inApp',
  'email',
  'sms',
  'desktop',
  'webhook',
];

export interface TriggerDefinition {
  trigger: PartnerTrigger;
  label: string;
  description: string;
  orgTypes: OrgType[];
  critical: boolean;
  defaultRoles: StaffRole[];
  defaultChannels: Record<PartnerChannel, boolean>;
}

const ALL_ORGS = [OrgType.CLINIC, OrgType.HOSPITAL, OrgType.DIAGNOSTIC];
const R = StaffRole;

const channels = (on: PartnerChannel[]): Record<PartnerChannel, boolean> => ({
  inApp: on.includes('inApp'),
  email: on.includes('email'),
  sms: on.includes('sms'),
  desktop: on.includes('desktop'),
  webhook: on.includes('webhook'),
});

export const TRIGGER_CATALOG: TriggerDefinition[] = [
  {
    trigger: PartnerTrigger.NEW_BOOKING,
    label: 'New patient booking',
    description:
      'A patient books (or requests) an appointment with your organisation.',
    orgTypes: ALL_ORGS,
    critical: false,
    defaultRoles: [R.ADMIN, R.RECEPTIONIST, R.DOCTOR],
    defaultChannels: channels(['inApp', 'desktop']),
  },
  {
    trigger: PartnerTrigger.BOOKING_CHANGED,
    label: 'Booking cancelled or moved',
    description: 'A patient cancels or reschedules an appointment.',
    orgTypes: ALL_ORGS,
    critical: false,
    defaultRoles: [R.ADMIN, R.RECEPTIONIST, R.DOCTOR],
    defaultChannels: channels(['inApp']),
  },
  {
    trigger: PartnerTrigger.RECORDS_SHARED,
    label: 'Patient shared records',
    description:
      'A patient grants your organisation access to their Medical Vault.',
    orgTypes: ALL_ORGS,
    critical: false,
    defaultRoles: [R.ADMIN, R.DOCTOR],
    defaultChannels: channels(['inApp']),
  },
  {
    trigger: PartnerTrigger.REFERRAL_RECEIVED,
    label: 'Incoming referral',
    description: 'Another doctor, clinic or hospital refers a patient to you.',
    orgTypes: ALL_ORGS,
    critical: false,
    defaultRoles: [R.ADMIN, R.RECEPTIONIST, R.DOCTOR],
    defaultChannels: channels(['inApp', 'email', 'desktop']),
  },
  {
    trigger: PartnerTrigger.REFERRAL_UPDATED,
    label: 'Referral accepted / declined',
    description:
      'An organisation you referred a patient to responds to the referral.',
    orgTypes: ALL_ORGS,
    critical: false,
    defaultRoles: [R.ADMIN, R.DOCTOR],
    defaultChannels: channels(['inApp']),
  },
  {
    trigger: PartnerTrigger.LAB_ORDER_RECEIVED,
    label: 'New lab order',
    description:
      'A test order is created — from a walk-in, a booking or a referral.',
    orgTypes: [OrgType.DIAGNOSTIC],
    critical: false,
    defaultRoles: [R.ADMIN, R.RECEPTIONIST, R.TECHNICIAN],
    defaultChannels: channels(['inApp', 'desktop']),
  },
  {
    trigger: PartnerTrigger.LAB_RESULT_READY,
    label: 'Lab result uploaded',
    description:
      'A diagnostic centre releases a report for a patient you referred.',
    orgTypes: [OrgType.CLINIC, OrgType.HOSPITAL],
    critical: false,
    defaultRoles: [R.ADMIN, R.DOCTOR],
    defaultChannels: channels(['inApp', 'email']),
  },
  {
    trigger: PartnerTrigger.CRITICAL_LAB_RESULT,
    label: 'Emergency / critical lab result',
    description:
      'A released report contains a value in the critical range — for the referring doctor, and for the lab that produced it.',
    orgTypes: ALL_ORGS,
    critical: true,
    defaultRoles: [R.ADMIN, R.DOCTOR],
    defaultChannels: channels(['inApp', 'email', 'sms', 'desktop']),
  },
  {
    trigger: PartnerTrigger.ADMISSION_UPDATE,
    label: 'Admissions & discharges',
    description:
      'A patient is admitted, transferred between wards or discharged.',
    orgTypes: [OrgType.HOSPITAL],
    critical: false,
    defaultRoles: [R.ADMIN, R.NURSE],
    defaultChannels: channels(['inApp']),
  },
  {
    trigger: PartnerTrigger.STAFF_JOINED,
    label: 'Staff member joined',
    description: 'An invited staff member accepts their invitation.',
    orgTypes: ALL_ORGS,
    critical: false,
    defaultRoles: [R.ADMIN],
    defaultChannels: channels(['inApp']),
  },
];

export function triggerDefinition(trigger: PartnerTrigger): TriggerDefinition {
  return TRIGGER_CATALOG.find((t) => t.trigger === trigger)!;
}

/** In-app feed trigger name, namespaced so partner and patient feeds never mix. */
export function feedTrigger(trigger: PartnerTrigger): string {
  return `partner_${trigger}`;
}
