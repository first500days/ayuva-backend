import {
  CareStepStatus,
  type StepTrigger,
} from './schemas/care-journey.schema';

/**
 * The patient's "My Journey" map: every real thing that has happened or is
 * booked, in order, plus the steps of a pathway they started. Nothing here is
 * invented or estimated: a milestone has a date only when an appointment, a
 * prescription or a document supplies one.
 */

export type MilestoneKind =
  | 'step'
  | 'appointment'
  | 'follow_up'
  | 'prescription'
  | 'lab_report'
  | 'scan'
  | 'discharge'
  | 'pharmacy'
  | 'lab_order';

export type MilestoneState = 'done' | 'current' | 'upcoming';

export interface Milestone {
  id: string;
  kind: MilestoneKind;
  title: string;
  detail?: string;
  /** ISO time. Absent for a pathway step nothing has dated yet. */
  at?: string;
  /** The date is a whole day: don't print a clock time for it. */
  allDay?: boolean;
  state: MilestoneState;
  route?: string;
  params?: Record<string, string>;
}

export interface MapStep {
  name: string;
  status: CareStepStatus;
  contextNote?: string;
  trigger?: StepTrigger;
  route?: string;
  params?: Record<string, string>;
}

export interface MapJourney {
  id: string;
  createdAt: Date;
  steps: MapStep[];
}

export interface MapAppointment {
  id: string;
  providerName: string;
  at: Date;
  createdAt: Date;
  completed: boolean;
  isFollowUp: boolean;
}

export interface MapPrescription {
  id: string;
  doctorName: string;
  signedAt: Date;
  followUpDate?: Date;
}

export interface MapRecord {
  id: string;
  type: string;
  providerName?: string;
  fromProvider: boolean;
  date: Date;
  uploadedAt: Date;
}

/** A hospital pharmacy handing over a prescription's medicines (Partner Portal). */
export interface MapDispense {
  id: string;
  providerName: string;
  at: Date;
  /** False when some lines were not supplied. */
  complete: boolean;
}

/** A diagnostic order placed with a lab or hospital (Partner Portal). */
export interface MapLabOrder {
  id: string;
  orderNo: string;
  providerName: string;
  status: string;
  orderedAt: Date;
  /** When the lab closed it (report ready or delivered). */
  closedAt?: Date;
  tests: number;
}

export interface JourneyMapInput {
  now: Date;
  journey?: MapJourney | null;
  appointments: MapAppointment[];
  prescriptions: MapPrescription[];
  records: MapRecord[];
  dispenses?: MapDispense[];
  labOrders?: MapLabOrder[];
}

const LAB_OPEN_LABEL: Record<string, string> = {
  ordered: 'Ordered — waiting for your sample',
  sample_collected: 'Sample collected',
  processing: 'Being tested',
};

const LAB_CLOSED = new Set(['report_ready', 'delivered']);

export interface JourneyMap {
  milestones: Milestone[];
  /** The pathway's steps with statuses worked out from what has happened. */
  steps: MapStep[];
  progressPct: number;
}

const DAY_MS = 24 * 60 * 60_000;
// A follow-up nobody booked stays on the map for a month, then stops nagging.
const OVERDUE_FOLLOW_UP_DAYS = 30;
// An appointment this close to the doctor's date is taken to be that follow-up.
const FOLLOW_UP_MATCH_DAYS = 3;
// The map is drawn node by node on a phone; old history lives in the vault.
const MAX_DONE = 30;

const RECORD_KIND: Record<string, MilestoneKind> = {
  prescription: 'prescription',
  lab_report: 'lab_report',
  scan: 'scan',
  discharge: 'discharge',
};

const RECORD_TITLE: Record<string, string> = {
  prescription: 'Prescription',
  lab_report: 'Lab report',
  scan: 'Scan',
  discharge: 'Discharge summary',
};

const recordDetail = (r: MapRecord) =>
  r.fromProvider && r.providerName ? `From ${r.providerName}` : 'Added by you';

interface Evidence {
  met: boolean;
  at?: Date;
  allDay?: boolean;
  detail?: string;
  route?: string;
  params?: Record<string, string>;
  appointmentId?: string;
  recordId?: string;
  prescriptionId?: string;
}

function earliest<T>(items: T[], key: (item: T) => Date): T | undefined {
  return [...items].sort((a, b) => key(a).getTime() - key(b).getTime())[0];
}

/** What, if anything, has happened since the pathway began that answers each step. */
function evidenceFinder(input: JourneyMapInput, since: Date) {
  const bookings = input.appointments.filter((a) => a.createdAt >= since);
  const visit =
    earliest(
      bookings.filter((a) => !a.isFollowUp),
      (a) => a.createdAt,
    ) ?? earliest(bookings, (a) => a.createdAt);
  const followUpVisit = earliest(
    bookings.filter((a) => a.isFollowUp && a.id !== visit?.id),
    (a) => a.createdAt,
  );
  const document = earliest(
    input.records.filter((r) => r.uploadedAt >= since),
    (r) => r.uploadedAt,
  );
  const askedBack = earliest(
    input.prescriptions.filter((p) => p.signedAt >= since && p.followUpDate),
    (p) => p.signedAt,
  );

  return (trigger: StepTrigger): Evidence => {
    switch (trigger) {
      case 'booked':
        return visit
          ? {
              met: true,
              at: visit.createdAt,
              detail: `Booked with ${visit.providerName}`,
              route: '/appointments',
            }
          : { met: false };
      case 'visited':
        return visit
          ? {
              met: visit.completed,
              at: visit.at,
              detail: `With ${visit.providerName}`,
              route: '/appointments',
              params: { appointmentId: visit.id },
              appointmentId: visit.id,
            }
          : { met: false };
      case 'document':
        return document
          ? {
              met: true,
              at: document.uploadedAt,
              detail: recordDetail(document),
              route: '/record/[id]',
              params: { id: document.id },
              recordId: document.id,
            }
          : { met: false };
      case 'followup':
        if (followUpVisit)
          return {
            met: followUpVisit.completed,
            at: followUpVisit.at,
            detail: `With ${followUpVisit.providerName}`,
            route: '/appointments',
            appointmentId: followUpVisit.id,
          };
        return askedBack
          ? {
              met: false,
              at: askedBack.followUpDate,
              allDay: true,
              detail: `${askedBack.doctorName} asked to see you again`,
              route: '/appointments',
              prescriptionId: askedBack.id,
            }
          : { met: false };
    }
  };
}

export function buildJourneyMap(input: JourneyMapInput): JourneyMap {
  const { now, journey } = input;
  const usedAppointments = new Set<string>();
  const usedRecords = new Set<string>();
  const usedFollowUps = new Set<string>();
  const nodes: Milestone[] = [];
  const steps: MapStep[] = [];

  if (journey) {
    const find = evidenceFinder(input, journey.createdAt);
    const evidence = journey.steps.map((s) =>
      s.trigger ? find(s.trigger) : null,
    );
    // A later step having happened means the earlier ones are behind the patient.
    const lastMet = evidence.reduce((last, e, i) => (e?.met ? i : last), -1);

    journey.steps.forEach((step, i) => {
      const e = evidence[i];
      if (e?.appointmentId) usedAppointments.add(e.appointmentId);
      if (e?.recordId) usedRecords.add(e.recordId);
      if (e?.prescriptionId) usedFollowUps.add(e.prescriptionId);

      // Pathways from before step triggers existed keep their stored status.
      const done = e ? i <= lastMet : step.status === CareStepStatus.DONE;
      steps.push({
        ...step,
        status: done ? CareStepStatus.DONE : CareStepStatus.UPCOMING,
      });
      nodes.push({
        id: `step:${journey.id}:${i}`,
        kind: 'step',
        title: step.name,
        detail: done
          ? (e?.detail ?? undefined)
          : (e?.detail ?? step.contextNote),
        at: (e?.at ?? (done ? journey.createdAt : undefined))?.toISOString(),
        allDay: e?.allDay,
        state: done ? 'done' : 'upcoming',
        route: e?.route ?? (done ? undefined : step.route),
        params: e?.params ?? (done ? undefined : step.params),
      });
    });
    const firstOpen = steps.find((s) => s.status !== CareStepStatus.DONE);
    if (firstOpen) firstOpen.status = CareStepStatus.CURRENT;
  }

  for (const a of input.appointments) {
    if (usedAppointments.has(a.id)) continue;
    nodes.push({
      id: `appt:${a.id}`,
      kind: 'appointment',
      title: `Visit with ${a.providerName}`,
      at: a.at.toISOString(),
      state: a.completed || a.at <= now ? 'done' : 'upcoming',
      route: '/appointments',
      params: { appointmentId: a.id },
    });
  }

  for (const p of input.prescriptions) {
    if (!p.followUpDate || usedFollowUps.has(p.id)) continue;
    const due = p.followUpDate.getTime();
    const overdueDays = (now.getTime() - due) / DAY_MS;
    if (overdueDays > OVERDUE_FOLLOW_UP_DAYS) continue;
    const alreadyBooked = input.appointments.some(
      (a) =>
        a.createdAt >= p.signedAt &&
        Math.abs(a.at.getTime() - due) <= FOLLOW_UP_MATCH_DAYS * DAY_MS,
    );
    if (alreadyBooked) continue;
    nodes.push({
      id: `rx:${p.id}:followup`,
      kind: 'follow_up',
      title: `Follow-up with ${p.doctorName}`,
      detail:
        overdueDays > 1
          ? 'This date has passed. Book a visit when you’re ready.'
          : 'Your doctor asked to see you again',
      at: p.followUpDate.toISOString(),
      allDay: true,
      state: 'upcoming',
      route: '/appointments',
    });
  }

  for (const r of input.records) {
    const kind = RECORD_KIND[r.type];
    if (!kind || usedRecords.has(r.id)) continue;
    nodes.push({
      id: `rec:${r.id}`,
      kind,
      title: RECORD_TITLE[r.type],
      detail: recordDetail(r),
      at: r.date.toISOString(),
      allDay: true,
      state: 'done',
      route: '/record/[id]',
      params: { id: r.id },
    });
  }

  for (const d of input.dispenses ?? []) {
    nodes.push({
      id: `disp:${d.id}`,
      kind: 'pharmacy',
      title: `Medicines dispensed at ${d.providerName}`,
      detail: d.complete
        ? 'Everything on the prescription was handed over'
        : 'Some items weren’t supplied — check with the pharmacy',
      at: d.at.toISOString(),
      state: 'done',
      route: '/meds',
    });
  }

  for (const o of input.labOrders ?? []) {
    const tests = `${o.tests} test${o.tests === 1 ? '' : 's'}`;
    if (LAB_CLOSED.has(o.status)) {
      nodes.push({
        id: `lab:${o.id}`,
        kind: 'lab_order',
        title: `Lab results ready at ${o.providerName}`,
        detail: `Order ${o.orderNo} · ${tests}`,
        at: (o.closedAt ?? o.orderedAt).toISOString(),
        state: 'done',
        route: '/(tabs)/records',
      });
    } else if (LAB_OPEN_LABEL[o.status]) {
      nodes.push({
        id: `lab:${o.id}`,
        kind: 'lab_order',
        title: `Lab tests at ${o.providerName}`,
        detail: `${LAB_OPEN_LABEL[o.status]} · ${tests}`,
        state: 'upcoming',
      });
    }
  }

  const time = (m: Milestone) => (m.at ? Date.parse(m.at) : 0);
  const done = nodes
    .filter((n) => n.state === 'done')
    .sort((a, b) => time(a) - time(b))
    .slice(-MAX_DONE);
  // Dated things first, soonest on top; steps nothing has dated keep their order.
  const open = nodes.filter((n) => n.state !== 'done');
  const orderedOpen = [
    ...open.filter((n) => n.at).sort((a, b) => time(a) - time(b)),
    ...open.filter((n) => !n.at),
  ];
  if (orderedOpen[0]) orderedOpen[0].state = 'current';

  const doneSteps = steps.filter(
    (s) => s.status === CareStepStatus.DONE,
  ).length;
  return {
    milestones: [...done, ...orderedOpen],
    steps,
    progressPct: steps.length
      ? Math.round((doneSteps / steps.length) * 100)
      : 0,
  };
}
