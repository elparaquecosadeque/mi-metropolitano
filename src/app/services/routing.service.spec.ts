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

  it('an unavailable short direct (e.g. a Fri/Sat-only lechucero) does not suppress a longer available transfer', () => {
    // angamos -> jiron-union: Ruta C runs direct (10 stops), and Lechucero also connects them
    // directly in only 2 stops but is Fri/Sat 23:30-04:00 only — it must not set the bar that
    // the Expreso 1 -> Ruta A/C transfer (6 stops) gets judged against.
    const opts = makeRouting().findOptions('angamos', 'jiron-union', MON_10, 2);
    const viaExpreso1 = opts.find(
      o => o.type === 'transfer' && o.legs[0].route.id === 'expreso-1'
    );
    expect(viaExpreso1).toBeDefined();
  });

  it('picks the hub that rides the expreso furthest (Expreso 5 -> Ruta C: Ricardo Palma, not Angamos or Estación Central)', () => {
    // espana -> benavides: Expreso 5 skips benavides. Angamos (5+2=7 stops) and Ricardo
    // Palma (6+1=7 stops) tie on total stops too, since an expreso stop and a troncal stop
    // aren't the same real distance — but Ricardo Palma spends 1 less stop on the slow
    // troncal leg, which the tiebreaker should prefer over Angamos, and both crush the
    // estacion-central detour (11 stops total).
    const opts = makeRouting().findOptions('espana', 'benavides', MON_10, 2);
    const viaExpreso5 = opts.find(
      o => o.type === 'transfer' && o.legs[0].route.id === 'expreso-5' && o.legs[1].route.id === 'ruta-c'
    );
    expect(viaExpreso5).toBeDefined();
    expect(viaExpreso5!.legs[0].alightingStation.id).toBe('ricardo-palma');
    expect(viaExpreso5!.legs[1].stops).toBe(1);
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

  it('non-backtracking transfer scores better than backtracking transfer within the same tier', () => {
    const opts = makeRouting().findOptions('ricardo-palma', 'estadio-union', MON_10, 2);
    // Only available transfers get the backtrack penalty — unavailable ones all score 8 flat
    const available = opts.filter(o => o.type === 'transfer' && o.legs.every(l => l.available));
    const noBacktrack = available.filter(o => o.backtrackStops === 0);
    const withBacktrack = available.filter(o => o.backtrackStops > 0);

    withBacktrack.forEach(bt => {
      const tier = Math.floor(bt.score);
      const sameTierNoBT = noBacktrack.filter(o => Math.floor(o.score) === tier);
      if (sameTierNoBT.length > 0) {
        const bestNoBT = Math.min(...sameTierNoBT.map(o => o.score));
        expect(bestNoBT).toBeLessThan(bt.score);
      }
    });
  });
});

// ── ScheduleService ───────────────────────────────────────────────────────────

describe('ScheduleService', () => {
  const svc = new ScheduleService();

  it('returns true when current time is within a weekday window', () => {
    expect(svc.isAvailable([{ days: ['lunes-sabado'], start: '05:00', end: '23:00' }], MON_10)).toBe(true);
  });

  it('returns false when current time is past the window end', () => {
    expect(svc.isAvailable([{ days: ['lunes-sabado'], start: '05:00', end: '23:00' }], MON_2330)).toBe(false);
  });

  it('returns false on a non-matching day', () => {
    const sunday = new Date('2025-01-05T10:00:00');
    expect(svc.isAvailable([{ days: ['lv'], start: '05:00', end: '22:00' }], sunday)).toBe(false);
  });

  it('returns true for midnight-spanning window at the late end', () => {
    const fridayNight = new Date('2025-01-03T23:45:00');
    expect(svc.isAvailable([{ days: ['viernesSabado'], start: '23:30', end: '04:00' }], fridayNight)).toBe(true);
  });

  it('returns true for midnight-spanning window in the early hours', () => {
    const satEarly = new Date('2025-01-04T01:00:00');
    expect(svc.isAvailable([{ days: ['viernesSabado'], start: '23:30', end: '04:00' }], satEarly)).toBe(true);
  });
});
