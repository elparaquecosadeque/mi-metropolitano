import { RoutingService } from './routing.service';
import { ScheduleService } from './schedule.service';

// Monday 6 Jan 2025, 10:00 — most routes available
const MON_10 = new Date('2025-01-06T10:00:00');
// Monday 6 Jan 2025, 23:30 — past most route end times
const MON_2330 = new Date('2025-01-06T23:30:00');

function makeRouting(): RoutingService {
  return new RoutingService(new ScheduleService());
}

// ── RoutingService ────────────────────────────────────────────────────────────

describe('RoutingService — direct routes', () => {
  it('finds a direct option between stations on the same route', () => {
    const opts = makeRouting().findOptions('naranjal', 'estacion-central', MON_10, 0);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].type).toBe('direct');
  });

  it('ranks available expreso above troncal for the same pair', () => {
    // estacion-central → javier-prado: Ruta C (troncal) and Expreso 1/5 (expreso) both serve it
    const opts = makeRouting().findOptions('estacion-central', 'javier-prado', MON_10, 0);
    expect(opts[0].legs[0].route.type).toBe('expreso');
  });

  it('returns empty array for identical origin and destination', () => {
    expect(makeRouting().findOptions('naranjal', 'naranjal', MON_10, 0)).toEqual([]);
  });

  it('maxTransfers=0 returns only direct options', () => {
    const opts = makeRouting().findOptions('chimpu-ocllo', 'canada', MON_10, 0);
    expect(opts.every(o => o.type === 'direct')).toBe(true);
  });

  it('direct route backtrackStops is always 0', () => {
    const opts = makeRouting().findOptions('naranjal', 'estacion-central', MON_10, 0);
    expect(opts.every(o => o.backtrackStops === 0)).toBe(true);
  });
});

describe('RoutingService — transfer routes', () => {
  it('finds a transfer when no direct route exists', () => {
    // chimpu-ocllo is only on Ruta B and Expreso 13; neither reaches canada directly
    const opts = makeRouting().findOptions('chimpu-ocllo', 'canada', MON_10, 2);
    expect(opts.some(o => o.type === 'transfer')).toBe(true);
  });

  it('geographic filter: estacion-central not used as hub for a southern sub-journey', () => {
    // estadio-union(39) → ricardo-palma(33): path range [31,41] — estacion-central(24) is outside
    const opts = makeRouting().findOptions('estadio-union', 'ricardo-palma', MON_10, 2);
    const hasECHub = opts.some(
      o => o.type === 'transfer' && o.legs[0].alightingStation.id === 'estacion-central'
    );
    expect(hasECHub).toBe(false);
  });

  it('transfer option preferred over unavailable direct when available', () => {
    const opts = makeRouting().findOptions('chimpu-ocllo', 'canada', MON_10, 2);
    const available = opts.filter(o => o.legs.every(l => l.available));
    expect(available.length).toBeGreaterThan(0);
  });
});

describe('RoutingService — backtrack awareness', () => {
  it('computes backtrackStops=1 for a hub one step behind origin (going south)', () => {
    // ricardo-palma(33) → estadio-union(39), going south
    // angamos(32) is 1 geo position north of origin → backtrack = 1
    const opts = makeRouting().findOptions('ricardo-palma', 'estadio-union', MON_10, 2);
    const viaAngamos = opts.find(
      o => o.type === 'transfer' && o.legs[0].alightingStation.id === 'angamos'
    );
    expect(viaAngamos).toBeDefined();
    expect(viaAngamos!.backtrackStops).toBe(1);
  });

  it('computes backtrackStops=0 for a hub ahead of origin (going south)', () => {
    // 28-de-julio(35) is south of ricardo-palma(33) → no backtrack
    const opts = makeRouting().findOptions('ricardo-palma', 'estadio-union', MON_10, 2);
    const via28 = opts.find(
      o => o.type === 'transfer' && o.legs[0].alightingStation.id === '28-de-julio'
    );
    expect(via28).toBeDefined();
    expect(via28!.backtrackStops).toBe(0);
  });

  it('non-backtracking transfer scores better than backtracking transfer of same route type', () => {
    const opts = makeRouting().findOptions('ricardo-palma', 'estadio-union', MON_10, 2);
    const noBacktrack = opts.filter(o => o.type === 'transfer' && o.backtrackStops === 0);
    const withBacktrack = opts.filter(o => o.type === 'transfer' && o.backtrackStops > 0);

    if (noBacktrack.length > 0 && withBacktrack.length > 0) {
      const bestNoBacktrack = Math.min(...noBacktrack.map(o => o.score));
      const bestWithBacktrack = Math.min(...withBacktrack.map(o => o.score));
      expect(bestNoBacktrack).toBeLessThan(bestWithBacktrack);
    }
  });
});

// ── ScheduleService ───────────────────────────────────────────────────────────

describe('ScheduleService', () => {
  const svc = new ScheduleService();
  const makeRoute = (schedules: any) => ({ schedules } as any);

  it('returns true when current time is within a weekday window', () => {
    const route = makeRoute([{ days: ['lunes-sabado'], start: '05:00', end: '23:00' }]);
    expect(svc.isAvailable(route, MON_10)).toBe(true);
  });

  it('returns false when current time is past the window end', () => {
    const route = makeRoute([{ days: ['lunes-sabado'], start: '05:00', end: '23:00' }]);
    expect(svc.isAvailable(route, MON_2330)).toBe(false);
  });

  it('returns false on a non-matching day', () => {
    const route = makeRoute([{ days: ['lv'], start: '05:00', end: '22:00' }]);
    const sunday = new Date('2025-01-05T10:00:00');
    expect(svc.isAvailable(route, sunday)).toBe(false);
  });

  it('returns true for midnight-spanning window at the late end', () => {
    const route = makeRoute([{ days: ['viernesSabado'], start: '23:30', end: '04:00' }]);
    const fridayNight = new Date('2025-01-03T23:45:00'); // Friday 23:45
    expect(svc.isAvailable(route, fridayNight)).toBe(true);
  });

  it('returns true for midnight-spanning window in the early hours', () => {
    const route = makeRoute([{ days: ['viernesSabado'], start: '23:30', end: '04:00' }]);
    // Saturday 01:00 — the viernesSabado window started on Friday night, now it's Saturday 01:00
    // Saturday is also a valid 'viernesSabado' day (dow=6), and 01:00 < 04:00 → active
    const satEarly = new Date('2025-01-04T01:00:00');
    expect(svc.isAvailable(route, satEarly)).toBe(true);
  });
});
