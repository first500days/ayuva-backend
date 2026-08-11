export const REMINDER_QUEUE_NAME = 'reminders';
export const REMINDER_QUEUE = 'REMINDER_QUEUE';

export enum ReminderJobName {
  MEDICATION = 'medication-reminder',
  APPOINTMENT = 'appointment-reminder',
  REFILL = 'refill-reminder',
  DOCUMENT_UPLOAD = 'document-upload-confirmation',
  FOLLOW_UP = 'follow-up-reminder',
}

export interface MedicationReminderJobData {
  type: ReminderJobName.MEDICATION;
  medicationId: string;
  userId: string;
  name: string;
  dosage: string;
  scheduleTime: string;
}

export interface AppointmentReminderJobData {
  type: ReminderJobName.APPOINTMENT;
  appointmentId: string;
  userId: string;
  providerName: string;
  date: string;
  time: string;
}

export interface RefillReminderJobData {
  type: ReminderJobName.REFILL;
  medicationId: string;
  userId: string;
  name: string;
  suppliesRemainingDays: number;
}

export interface DocumentUploadJobData {
  type: ReminderJobName.DOCUMENT_UPLOAD;
  recordId: string;
  userId: string;
  fileName: string;
}

export interface FollowUpReminderJobData {
  type: ReminderJobName.FOLLOW_UP;
  appointmentId: string;
  userId: string;
  providerName: string;
}

export type ReminderJobData =
  | MedicationReminderJobData
  | AppointmentReminderJobData
  | RefillReminderJobData
  | DocumentUploadJobData
  | FollowUpReminderJobData;

export function medicationReminderJobId(
  medicationId: string,
  scheduleTime: string,
): string {
  return `med-${medicationId}-${scheduleTime}`;
}

export function appointmentReminderJobId(appointmentId: string): string {
  return `appt-${appointmentId}`;
}

// One refill nudge per medication per day, even if multiple doses are logged
// that day — dedupe key includes the date on purpose.
export function refillReminderJobId(
  medicationId: string,
  isoDate: string,
): string {
  return `refill-${medicationId}-${isoDate}`;
}

export function documentUploadJobId(recordId: string): string {
  return `doc-upload-${recordId}`;
}

export function followUpReminderJobId(appointmentId: string): string {
  return `followup-${appointmentId}`;
}
