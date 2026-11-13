/**
 * Pre-visit preparation for the Prep Pack, adapted to what the appointment
 * is for. Fasting windows come only from the lab's own data: a test marked
 * "fasting required", with the hours read from the lab's preparation text.
 * Nothing here is medical advice of its own; when the lab names no hours,
 * the usual 8-hour minimum is shown and the patient is told to confirm it.
 */

export const USUAL_FASTING_HOURS = 8;

export interface PrepTest {
  name: string;
  fastingRequired: boolean;
  preparation?: string | null;
}

export interface FastingWindow {
  id: string;
  kind: 'countdown';
  title: string;
  detail: string;
  /** When eating should stop. */
  startsAt: string;
  /** The appointment. */
  endsAt: string;
  hours: number;
  /** Where the hours came from: the lab's instructions, or the usual minimum. */
  hoursFrom: 'lab' | 'usual';
  tests: string[];
}

export interface PrepTask {
  id: string;
  kind: 'task';
  title: string;
  done: boolean;
}

/** "Fast for 10-12 hours" → 12; "8 hrs fasting" → 8; nothing found → null. */
export function fastingHours(text: string | null | undefined): number | null {
  if (!text) return null;
  const range =
    /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:hours?|hrs?|h)\b/i.exec(text);
  if (range) return Math.max(Number(range[1]), Number(range[2]));
  const single = /(\d{1,2})\s*(?:hours?|hrs?|h)\b/i.exec(text);
  const n = single ? Number(single[1]) : null;
  return n && n >= 2 && n <= 24 ? n : null;
}

/** One fasting countdown for all the tests that need it, using the longest window any of them asks for. */
export function fastingWindow(
  appointmentAt: Date,
  tests: PrepTest[],
): FastingWindow | null {
  const fasting = tests.filter((t) => t.fastingRequired);
  if (!fasting.length) return null;
  const fromLab = fasting
    .map((t) => fastingHours(t.preparation))
    .filter((h): h is number => h !== null);
  const hours = fromLab.length ? Math.max(...fromLab) : USUAL_FASTING_HOURS;
  const startsAt = new Date(appointmentAt.getTime() - hours * 3_600_000);
  const names = fasting.map((t) => t.name);
  const instructions = fasting
    .map((t) => t.preparation?.trim())
    .filter((p): p is string => !!p);
  return {
    id: 'fasting',
    kind: 'countdown',
    title: `Fasting for ${names.length === 1 ? names[0] : `${names.length} tests`}`,
    detail: fromLab.length
      ? `${instructions[0]}${instructions.length > 1 ? ` (and ${instructions.length - 1} more instruction${instructions.length > 2 ? 's' : ''})` : ''}`
      : `The lab marked ${names.length === 1 ? 'this test' : 'these tests'} as needing fasting but gave no hours. ${USUAL_FASTING_HOURS} hours is the usual minimum: please confirm with the lab.`,
    startsAt: startsAt.toISOString(),
    endsAt: appointmentAt.toISOString(),
    hours,
    hoursFrom: fromLab.length ? 'lab' : 'usual',
    tests: names,
  };
}

/** Ticks for the documents the patient is preparing for the visit. */
export function documentTasks(state: {
  questionsChosen: number;
  recordsAttached: number;
  medicinesListed: number;
  symptomsNoted: boolean;
}): PrepTask[] {
  return [
    {
      id: 'symptoms',
      kind: 'task',
      title: 'Note your symptoms',
      done: state.symptomsNoted,
    },
    {
      id: 'questions',
      kind: 'task',
      title: 'Pick the questions you want to ask',
      done: state.questionsChosen > 0,
    },
    {
      id: 'records',
      kind: 'task',
      title: 'Attach your recent reports',
      done: state.recordsAttached > 0,
    },
    {
      id: 'medicines',
      kind: 'task',
      title: 'Check your medicine list',
      done: state.medicinesListed > 0,
    },
  ];
}
