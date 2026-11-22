/**
 * Home-collection route planning without a maps service: visits keep their
 * booked times (patients chose them), and among visits booked for the same
 * slot the collector goes to the nearest pinned address next. Distances are
 * straight-line × a road factor and times assume city traffic, so ETAs are
 * estimates; live directions come from Google Maps with the planned order.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStop {
  id: string;
  lat?: number | null;
  lng?: number | null;
  scheduledAt?: Date | null;
}

export interface PlannedLeg {
  id: string;
  /** Road estimate from the previous stop (null when either end has no pin). */
  km: number | null;
  etaAt: Date;
  /** Arrival more than LATE_MIN after the booked time. */
  late: boolean;
}

export const ROAD_FACTOR = 1.3;
export const CITY_KMH = 20;
export const SERVICE_MIN = 10;
export const LATE_MIN = 30;

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * A pin from what a person pastes: "12.9716, 77.5946" or a Google Maps link
 * (…/@12.97,77.59,15z, ?q=12.97,77.59, ?ll=…, destination=…).
 */
export function parseLocation(text: string): LatLng | null {
  const s = decodeURIComponent(text.trim());
  const pair = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/;
  const at = /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(s);
  const q =
    /[?&](?:q|query|ll|destination|daddr)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(
      s,
    );
  const m = at ?? q ?? pair.exec(s);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

const pinOf = (s: RouteStop): LatLng | null =>
  typeof s.lat === 'number' && typeof s.lng === 'number'
    ? { lat: s.lat, lng: s.lng }
    : null;

/** Visits booked within this many minutes of each other count as one time slot. */
export const SAME_SLOT_MIN = 5;

/**
 * Visit order: patients booked a time, so visits go in booked order; among
 * visits booked for the same slot, the collector goes to the nearest pinned
 * address next. Visits with no booked time come last, nearest first.
 */
export function orderStops(
  start: LatLng | null,
  stops: RouteStop[],
): RouteStop[] {
  const left = [...stops];
  const out: RouteStop[] = [];
  let here = start;
  while (left.length) {
    const booked = left.filter((s) => s.scheduledAt);
    const earliest = Math.min(...booked.map((s) => s.scheduledAt!.getTime()));
    const candidates = booked.length
      ? booked.filter(
          (s) => s.scheduledAt!.getTime() <= earliest + SAME_SLOT_MIN * 60_000,
        )
      : left;
    let pick = candidates[0];
    if (here) {
      let best = Infinity;
      for (const s of candidates) {
        const p = pinOf(s);
        const d = p ? haversineKm(here, p) : Infinity;
        if (d < best) {
          best = d;
          pick = s;
        }
      }
    }
    left.splice(left.indexOf(pick), 1);
    out.push(pick);
    here = pinOf(pick) ?? here;
  }
  return out;
}

/** Estimated arrival at each stop in the given order, waiting for booked times when early. */
export function scheduleLegs(
  start: LatLng | null,
  ordered: RouteStop[],
  departAt: Date,
): { legs: PlannedLeg[]; totalKm: number } {
  let here = start;
  let clock = departAt.getTime();
  let totalKm = 0;
  const legs = ordered.map((s) => {
    const p = pinOf(s);
    const km =
      here && p
        ? Math.round(haversineKm(here, p) * ROAD_FACTOR * 10) / 10
        : null;
    if (km !== null) {
      totalKm += km;
      clock += (km / CITY_KMH) * 3_600_000;
    }
    const booked = s.scheduledAt?.getTime();
    if (booked !== undefined && clock < booked) clock = booked;
    const etaAt = new Date(clock);
    clock += SERVICE_MIN * 60_000;
    here = p ?? here;
    return {
      id: s.id,
      km,
      etaAt,
      late:
        booked !== undefined && etaAt.getTime() > booked + LATE_MIN * 60_000,
    };
  });
  return { legs, totalKm: Math.round(totalKm * 10) / 10 };
}

/** Google Maps directions through the stops (pins where known, addresses otherwise), at most 9 waypoints a link. */
export function mapsLinks(
  origin: string | null,
  stops: { pin: LatLng | null; address: string }[],
): string[] {
  const place = (s: { pin: LatLng | null; address: string }) =>
    s.pin ? `${s.pin.lat},${s.pin.lng}` : s.address;
  const links: string[] = [];
  let from = origin;
  for (let i = 0; i < stops.length; i += 10) {
    const chunk = stops.slice(i, i + 10);
    const dest = chunk[chunk.length - 1];
    const via = chunk.slice(0, -1).map(place);
    const params = new URLSearchParams({
      api: '1',
      travelmode: 'driving',
      destination: place(dest),
      ...(from ? { origin: from } : {}),
      ...(via.length ? { waypoints: via.join('|') } : {}),
    });
    links.push(`https://www.google.com/maps/dir/?${params.toString()}`);
    from = place(dest);
  }
  return links;
}
