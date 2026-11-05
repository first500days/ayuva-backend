import {
  haversineKm,
  mapsLinks,
  orderStops,
  parseLocation,
  scheduleLegs,
} from './route-plan';

const lab = { lat: 12.9716, lng: 77.5946 }; // central Bengaluru
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 6, h - 5, m - 30)); // IST wall clock

describe('route planning', () => {
  it('reads pins from coordinates and Google Maps links', () => {
    expect(parseLocation('12.9352, 77.6245')).toEqual({
      lat: 12.9352,
      lng: 77.6245,
    });
    expect(
      parseLocation(
        'https://www.google.com/maps/place/Koramangala/@12.9352,77.6245,15z',
      ),
    ).toEqual({ lat: 12.9352, lng: 77.6245 });
    expect(
      parseLocation('https://maps.google.com/?q=12.9352%2C77.6245'),
    ).toEqual({
      lat: 12.9352,
      lng: 77.6245,
    });
    expect(parseLocation('Flat 4B, MG Road')).toBeNull();
    expect(parseLocation('95.1234, 77.1234')).toBeNull();
  });

  it('measures straight-line distance', () => {
    expect(haversineKm(lab, { lat: 12.9352, lng: 77.6245 })).toBeCloseTo(
      5.17,
      1,
    );
  });

  it('keeps booked times; nearest-next only within the same slot; unbooked last', () => {
    const stops = [
      { id: 'far8', lat: 13.05, lng: 77.6, scheduledAt: at(8, 0) },
      { id: 'near830', lat: 12.98, lng: 77.6, scheduledAt: at(8, 30) },
      { id: 'nineFar', lat: 12.85, lng: 77.66, scheduledAt: at(9, 0) },
      { id: 'nineNear', lat: 12.96, lng: 77.61, scheduledAt: at(9, 2) },
      { id: 'any', lat: 12.97, lng: 77.59, scheduledAt: null },
      { id: 'nopin815', scheduledAt: at(8, 15) },
    ];
    expect(orderStops(lab, stops).map((s) => s.id)).toEqual([
      'far8',
      'nopin815',
      'near830',
      'nineNear',
      'nineFar',
      'any',
    ]);
  });

  it('estimates arrivals, waits for booked times and flags late visits', () => {
    const ordered = [
      { id: 'a', lat: 12.9352, lng: 77.6245, scheduledAt: at(8, 0) },
      { id: 'b', lat: 13.1986, lng: 77.7066, scheduledAt: at(8, 20) },
      { id: 'c', scheduledAt: at(11, 0) },
    ];
    const { legs, totalKm } = scheduleLegs(lab, ordered, at(7, 30));
    expect(legs[0].km).toBeCloseTo(6.7, 0);
    expect(legs[0].etaAt).toEqual(at(8, 0)); // early, waits for the booking
    expect(legs[0].late).toBe(false);
    expect(legs[1].late).toBe(true); // airport run can't make 08:20
    expect(legs[2].km).toBeNull();
    expect(legs[2].etaAt).toEqual(at(11, 0));
    expect(totalKm).toBeGreaterThan(40);
  });

  it('builds Google Maps links of up to ten stops each', () => {
    const stops = Array.from({ length: 12 }, (_, i) => ({
      pin: i % 2 ? { lat: 12.9 + i / 100, lng: 77.6 } : null,
      address: `House ${i}, Bengaluru`,
    }));
    const links = mapsLinks('12.9716,77.5946', stops);
    expect(links).toHaveLength(2);
    const first = new URL(links[0]);
    expect(first.searchParams.get('origin')).toBe('12.9716,77.5946');
    expect(first.searchParams.get('waypoints')?.split('|')).toHaveLength(9);
    expect(first.searchParams.get('destination')).toBe('12.99,77.6');
    expect(new URL(links[1]).searchParams.get('origin')).toBe('12.99,77.6');
  });
});
