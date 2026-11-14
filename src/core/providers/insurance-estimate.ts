/**
 * Estimated out-of-pocket cost of a consultation for a patient's insurer,
 * from what the provider says about its panel: whether it takes that insurer,
 * cashless or by reimbursement, whether out-patient consultations are covered,
 * and the co-pay. An estimate only; the insurer's policy decides.
 */

/** Insurers patients can pick in discovery (Indian market). */
export const INSURERS = [
  'Star Health',
  'HDFC ERGO',
  'ICICI Lombard',
  'Niva Bupa',
  'Care Health',
  'Aditya Birla Health',
  'Bajaj Allianz',
  'Tata AIG',
  'New India Assurance',
  'United India',
  'National Insurance',
  'Oriental Insurance',
  'CGHS',
  'ECHS',
] as const;

export interface PanelEntry {
  insurer: string;
  /** The insurer settles directly with the provider. */
  cashless: boolean;
  /** Out-patient consultations are covered under this panel. */
  opdCovered: boolean;
  /** The patient's share, percent of the fee (0-100). */
  copayPct?: number | null;
}

export interface FeeEstimate {
  insurer: string;
  fee: number;
  /** What the patient pays at the visit. */
  payAtVisit: number;
  /** What the patient can claim back afterwards (reimbursement panels). */
  claimBack: number;
  /** What the patient ends up paying. */
  outOfPocket: number;
  onPanel: boolean;
  note: string;
}

const round = (n: number) => Math.round(n);

export function estimateFee(
  fee: number | undefined | null,
  insurer: string,
  panel: PanelEntry[] = [],
): FeeEstimate | null {
  if (fee == null || !Number.isFinite(fee) || fee < 0) return null;
  const entry = panel.find(
    (p) => p.insurer.toLowerCase() === insurer.toLowerCase(),
  );
  if (!entry)
    return {
      insurer,
      fee,
      payAtVisit: fee,
      claimBack: 0,
      outOfPocket: fee,
      onPanel: false,
      note: `Not on this provider’s ${insurer} panel: the full fee is paid by you.`,
    };
  if (!entry.opdCovered)
    return {
      insurer,
      fee,
      payAtVisit: fee,
      claimBack: 0,
      outOfPocket: fee,
      onPanel: true,
      note: `${insurer} is accepted here, but out-patient consultations aren’t covered on this panel.`,
    };
  const copay = round(
    (fee * Math.min(100, Math.max(0, entry.copayPct ?? 0))) / 100,
  );
  return entry.cashless
    ? {
        insurer,
        fee,
        payAtVisit: copay,
        claimBack: 0,
        outOfPocket: copay,
        onPanel: true,
        note: copay
          ? `Cashless: you pay the ${entry.copayPct}% co-pay.`
          : 'Cashless: covered in full.',
      }
    : {
        insurer,
        fee,
        payAtVisit: fee,
        claimBack: fee - copay,
        outOfPocket: copay,
        onPanel: true,
        note: `Reimbursement: pay the fee, then claim ₹${fee - copay} back from ${insurer}.`,
      };
}
