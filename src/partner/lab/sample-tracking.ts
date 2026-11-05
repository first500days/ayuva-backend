/**
 * Vial life cycle for barcode tracking. A vial moves
 * labelled → collected → received → in_analysis → stored, or is rejected
 * (clotted, haemolysed, wrong tube…) at any point and must be recollected.
 */
export const SAMPLE_STAGES = [
  'labelled',
  'collected',
  'received',
  'in_analysis',
  'stored',
  'rejected',
] as const;
export type SampleStage = (typeof SAMPLE_STAGES)[number];

/** Stages a scan station can record (labels are printed, not scanned). */
export const STATION_STAGES = [
  'collected',
  'received',
  'in_analysis',
  'stored',
  'rejected',
] as const;

export const STAGE_LABEL: Record<SampleStage, string> = {
  labelled: 'labelled',
  collected: 'collected',
  received: 'received at the lab',
  in_analysis: 'loaded for analysis',
  stored: 'stored',
  rejected: 'rejected',
};

/** Default vial set for an order: one per sample type its tests need. */
export function labelTypes(items: { sampleType?: string | null }[]): string[] {
  const types = [
    ...new Set(
      items.map((i) => (i.sampleType ?? '').trim()).filter((t) => t.length),
    ),
  ];
  return types.length ? types : ['Sample'];
}

/**
 * Barcode for an order's nth vial. Order numbers look like LAB-261105-A1B2;
 * the label drops the prefix and dashes ("261105A1B2-1") so a 50 mm label
 * keeps bars wide enough for ordinary scanners. Still unique, because the
 * order number is.
 */
export function labelCode(orderNo: string, n: number): string {
  const m = /^LAB-(\d{6})-([0-9A-F]{4})$/.exec(orderNo);
  return m ? `${m[1]}${m[2]}-${n}` : `${orderNo}-${n}`;
}
