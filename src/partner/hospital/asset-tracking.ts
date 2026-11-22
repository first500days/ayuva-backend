/**
 * Rules for turning BLE / RFID gateway readings into a room for each tagged
 * machine. Gateways in neighbouring rooms often hear the same beacon; the
 * stronger signal wins while both readings are fresh.
 */

export interface Sighting {
  at: Date;
  zone: string;
  gatewayId: string;
  /** dBm; closer to 0 is nearer. */
  rssi?: number | null;
}

/** How long a reading holds against a weaker one from another gateway. */
export const HOLD_MS = 15_000;

/** Whether a new reading should replace the asset's current location. */
export function takesOver(
  prev: Sighting | undefined,
  next: Sighting,
  holdMs = HOLD_MS,
): boolean {
  if (!prev) return true;
  // Late or replayed readings never move an asset back.
  if (next.at.getTime() < prev.at.getTime()) return false;
  if (prev.gatewayId === next.gatewayId) return true;
  if (next.at.getTime() - prev.at.getTime() > holdMs) return true;
  return (next.rssi ?? -127) > (prev.rssi ?? -127);
}

/** Beacon MACs, iBeacon/Eddystone ids and RFID EPCs, upper-cased; anything else is ignored. */
export function normaliseTag(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toUpperCase();
  return /^[A-Z0-9:_.-]{4,64}$/.test(t) ? t : null;
}
