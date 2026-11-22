/**
 * Discharge readiness for a bed: a transparent, rule-based forecast built from
 * how far into the expected stay the patient is, whether their observations are
 * settled, whether investigations are back, and whether the bill is cleared.
 * It is a cue for the ward team only: nothing is ever discharged because of
 * it; a named head nurse or administrator approves every discharge.
 */

import type { WarningLevel } from './early-warning';

export interface ReadinessInput {
  admittedAt: Date;
  expectedDischargeAt?: Date | null;
  now: Date;
  /** Latest early-warning level, or null when nobody has charted in the last day. */
  warning: WarningLevel | null;
  /** Hospital lab samples for this stay not yet verified. */
  pendingLabs: number;
  /** Latest insurance claim's state for this stay: none (self-pay), cleared, pending, rejected. */
  claim: 'none' | 'cleared' | 'pending' | 'rejected';
}

export interface ReadinessFactor {
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface Readiness {
  percent: number;
  factors: ReadinessFactor[];
  /** At or above this, the bed shows "ready" and the discharge gate is suggested. */
  ready: boolean;
}

const DAY = 86_400_000;
/** Typical stay when the admitting team gave no expected date. */
export const DEFAULT_STAY_DAYS = 3;
export const READY_AT = 85;

export function dischargeReadiness(i: ReadinessInput): Readiness {
  const elapsed = Math.max(0, i.now.getTime() - i.admittedAt.getTime());
  const planned = i.expectedDischargeAt
    ? Math.max(
        DAY / 4,
        i.expectedDischargeAt.getTime() - i.admittedAt.getTime(),
      )
    : DEFAULT_STAY_DAYS * DAY;
  const stayShare = Math.min(1, elapsed / planned);
  const days = Math.floor(elapsed / DAY);
  const stay: ReadinessFactor = {
    label: 'Length of stay',
    max: 30,
    points: Math.round(30 * stayShare),
    detail: `Day ${days + 1} of ${i.expectedDischargeAt ? Math.max(1, Math.round(planned / DAY)) : `~${DEFAULT_STAY_DAYS} (no expected date set)`}`,
  };

  const stability: ReadinessFactor =
    i.warning === null
      ? {
          label: 'Observations',
          max: 35,
          points: 10,
          detail: 'No observations charted in the last 24 h',
        }
      : i.warning === 'none'
        ? {
            label: 'Observations',
            max: 35,
            points: 35,
            detail: 'Within normal limits',
          }
        : i.warning === 'watch'
          ? {
              label: 'Observations',
              max: 35,
              points: 15,
              detail: 'Early-warning score on watch',
            }
          : {
              label: 'Observations',
              max: 35,
              points: 0,
              detail: 'Early-warning score high — not settled',
            };

  const labs: ReadinessFactor = {
    label: 'Investigations',
    max: 20,
    points: i.pendingLabs === 0 ? 20 : 0,
    detail:
      i.pendingLabs === 0
        ? 'No results pending'
        : `${i.pendingLabs} result${i.pendingLabs === 1 ? '' : 's'} pending`,
  };

  const money: ReadinessFactor = {
    label: 'Billing',
    max: 15,
    points:
      i.claim === 'none' || i.claim === 'cleared'
        ? 15
        : i.claim === 'pending'
          ? 5
          : 0,
    detail:
      i.claim === 'none'
        ? 'No insurance claim (self-pay)'
        : i.claim === 'cleared'
          ? 'Insurer approved'
          : i.claim === 'pending'
            ? 'Insurance claim awaiting the insurer'
            : 'Insurance claim rejected',
  };

  const factors = [stay, stability, labs, money];
  const percent = Math.round(factors.reduce((n, f) => n + f.points, 0));
  return { percent, factors, ready: percent >= READY_AT };
}
