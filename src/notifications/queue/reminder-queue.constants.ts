export const REMINDER_QUEUE_NAME = 'reminders';
export const REMINDER_QUEUE = 'REMINDER_QUEUE';

export enum ReminderJobName {
  MEDICATION = 'medication-reminder',
  APPOINTMENT = 'appointment-reminder',
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

export type ReminderJobData =
  | MedicationReminderJobData
  | AppointmentReminderJobData;

export function medicationReminderJobId(
  medicationId: string,
  scheduleTime: string,
): string {
  return `med-${medicationId}-${scheduleTime}`;
}

export function appointmentReminderJobId(appointmentId: string): string {
  return `appt-${appointmentId}`;
}
