import { Injectable } from '@angular/core';
import { Route, RouteOption, RouteLeg, Station, Schedule } from '../models/route.model';
import { ROUTES, STATIONS, STATION_MAP } from '../data/routes';
import { ScheduleService } from './schedule.service';

// Geographic position: index in STATIONS array (0 = northernmost, 43 = southernmost)
const GEO_POS = new Map<string, number>(STATIONS.map((s, i) => [s.id, i]));

// Tacna and Jiron de la Unión have physically separated directional platforms — no cross-direction transfers
// ponytail: if more split-platform stations are confirmed, add them here
const NO_TRANSFER = new Set(['tacna', 'jiron-union']);

// All stations that appear on ≥2 routes (valid transfer points), minus split-platform ones
const stationRouteCount = new Map<string, number>();
for (const route of ROUTES) {
  // Deduplicate per route across all directions and variants
  const allStops = new Set([
    ...route.stations,
    ...(route.stationsNorthbound ?? []),
    ...(route.variants?.flatMap(v => v.stations) ?? []),
  ]);
  for (const id of allStops) {
    stationRouteCount.set(id, (stationRouteCount.get(id) ?? 0) + 1);
  }
}
const ALL_TRANSFER_STATIONS = [...stationRouteCount.keys()].filter(
  id => (stationRouteCount.get(id) ?? 0) >= 2 && !NO_TRANSFER.has(id)
);

// Hardcoded main hubs for 2-transfer only (performance: 3 hubs vs 42² combinatorial explosion)
const MAIN_HUBS = ['estacion-central', 'naranjal', 'plaza-de-flores'];

/** Returns true if a transfer hub is geographically on the path between origin and destination. */
function isOnPath(originPos: number, hubPos: number, destPos: number): boolean {
  const lo = Math.min(originPos, destPos) - 2;
  const hi = Math.max(originPos, destPos) + 2;
  return hubPos >= lo && hubPos <= hi;
}

@Injectable({ providedIn: 'root' })
export class RoutingService {
  constructor(private schedule: ScheduleService) {}

  findOptions(
    originId: string,
    destinationId: string,
    now: Date,
    maxTransfers: 0 | 1 | 2 = 1
  ): RouteOption[] {
    if (originId === destinationId) return [];

    const directs = this.findDirect(originId, destinationId, now);
    const transfers: RouteOption[] = maxTransfers >= 1
      ? [
          ...this.findOneTransfer(originId, destinationId, now),
          ...(maxTransfers >= 2 ? this.findTwoTransfers(originId, destinationId, now) : []),
        ]
      : [];

    // Secondary backtrack guard: if an available direct exists, drop transfers that are ≥1.75× its stops
    // (the geographic hub filter is the primary defense; this catches any remaining edge cases)
    // Unavailable directs (e.g. a Fri/Sat-only lechucero) must not set the bar — a short but
    // currently-closed direct would otherwise suppress every legitimate transfer option.
    const availableDirects = directs.filter(o => o.legs[0].available);
    const minDirectStops = availableDirects.length
      ? Math.min(...availableDirects.map(o => o.legs[0].stops))
      : Infinity;

    const filteredTransfers = transfers.filter(o => {
      const total = o.legs.reduce((s, l) => s + l.stops, 0);
      if (total <= minDirectStops) return true;
      return o.legs.some(l => l.route.type === 'expreso') && total < minDirectStops * 1.75;
    });

    return [...directs, ...filteredTransfers].sort((a, b) => a.score - b.score);
  }

  // ── Direct ──────────────────────────────────────────────────────────────────

  private findDirect(originId: string, destinationId: string, now: Date): RouteOption[] {
    const options: RouteOption[] = [];
    for (const route of ROUTES) {
      const leg = this.buildLeg(route, originId, destinationId, now);
      if (!leg) continue;
      options.push({ type: 'direct', legs: [leg], score: this.scoreDirect(leg), backtrackStops: 0 });
    }
    return options;
  }

  // ── 1 transfer ──────────────────────────────────────────────────────────────

  private findOneTransfer(originId: string, destinationId: string, now: Date): RouteOption[] {
    const seen = new Set<string>();
    const options: RouteOption[] = [];

    const originPos = GEO_POS.get(originId) ?? 0;
    const destPos   = GEO_POS.get(destinationId) ?? 43;
    const goingSouth = destPos > originPos;

    for (const hub of ALL_TRANSFER_STATIONS) {
      if (hub === originId || hub === destinationId) continue;

      const hubPos = GEO_POS.get(hub) ?? 0;
      if (!isOnPath(originPos, hubPos, destPos)) continue;

      const backtrackStops = goingSouth
        ? Math.max(0, originPos - hubPos)   // hub north of origin when going south
        : Math.max(0, hubPos - originPos);  // hub south of origin when going north

      for (const r1 of ROUTES) {
        const leg1 = this.buildLeg(r1, originId, hub, now);
        if (!leg1) continue;

        for (const r2 of ROUTES) {
          if (r2.id === r1.id) continue;
          const leg2 = this.buildLeg(r2, hub, destinationId, now);
          if (!leg2) continue;

          const key = `${r1.id}|${hub}|${r2.id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          options.push({
            type: 'transfer',
            legs: [leg1, leg2],
            score: this.scoreTransfer([leg1, leg2], backtrackStops),
            backtrackStops,
          });
        }
      }
    }

    // Keep only best-scored option per route pair — drops visually-identical cards via different hubs
    const bestByPair = new Map<string, RouteOption>();
    for (const opt of options) {
      const pairKey = `${opt.legs[0].route.id}|${opt.legs[1].route.id}`;
      const existing = bestByPair.get(pairKey);
      if (!existing || opt.score < existing.score) bestByPair.set(pairKey, opt);
    }
    return [...bestByPair.values()];
  }

  // ── 2 transfers ─────────────────────────────────────────────────────────────

  private findTwoTransfers(originId: string, destinationId: string, now: Date): RouteOption[] {
    const seen = new Set<string>();
    const options: RouteOption[] = [];

    const originPos = GEO_POS.get(originId) ?? 0;
    const destPos   = GEO_POS.get(destinationId) ?? 43;
    const goingSouth = destPos > originPos;

    for (let i = 0; i < MAIN_HUBS.length; i++) {
      const hub1 = MAIN_HUBS[i];
      if (hub1 === originId || hub1 === destinationId) continue;
      const hub1Pos = GEO_POS.get(hub1) ?? 0;
      if (!isOnPath(originPos, hub1Pos, destPos)) continue;

      const backtrackStops = goingSouth
        ? Math.max(0, originPos - hub1Pos)
        : Math.max(0, hub1Pos - originPos);

      for (let j = 0; j < MAIN_HUBS.length; j++) {
        if (i === j) continue;
        const hub2 = MAIN_HUBS[j];
        if (hub2 === originId || hub2 === destinationId || hub2 === hub1) continue;
        const hub2Pos = GEO_POS.get(hub2) ?? 0;
        if (!isOnPath(originPos, hub2Pos, destPos)) continue;

        for (const r1 of ROUTES) {
          const leg1 = this.buildLeg(r1, originId, hub1, now);
          if (!leg1) continue;

          for (const r2 of ROUTES) {
            if (r2.id === r1.id) continue;
            const leg2 = this.buildLeg(r2, hub1, hub2, now);
            if (!leg2) continue;

            for (const r3 of ROUTES) {
              if (r3.id === r1.id || r3.id === r2.id) continue;
              const leg3 = this.buildLeg(r3, hub2, destinationId, now);
              if (!leg3) continue;

              const key = `${r1.id}|${hub1}|${r2.id}|${hub2}|${r3.id}`;
              if (seen.has(key)) continue;
              seen.add(key);

              options.push({
                type: 'transfer',
                legs: [leg1, leg2, leg3],
                score: this.scoreTransfer([leg1, leg2, leg3], backtrackStops),
                backtrackStops,
              });
            }
          }
        }
      }
    }

    // Keep only best-scored option per route triple — drops visually-identical cards via different hub combos
    const bestByTriple = new Map<string, RouteOption>();
    for (const opt of options) {
      const tripleKey = `${opt.legs[0].route.id}|${opt.legs[1].route.id}|${opt.legs[2].route.id}`;
      const existing = bestByTriple.get(tripleKey);
      if (!existing || opt.score < existing.score) bestByTriple.set(tripleKey, opt);
    }
    return [...bestByTriple.values()];
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────

  private scoreDirect(leg: RouteLeg): number {
    const avail = leg.available;
    const exp = leg.route.type === 'expreso';
    if (avail && exp)  return 1;
    if (avail && !exp) return 2;
    if (!avail && exp) return 6;
    return 7;
  }

  private scoreTransfer(legs: RouteLeg[], backtrackStops: number): number {
    const allAvail = legs.every((l) => l.available);
    const expresoCount = legs.filter((l) => l.route.type === 'expreso').length;
    const transferCount = legs.length - 1;

    if (!allAvail) return 8;

    const tierBase = transferCount === 1 ? 0 : 2;
    let base: number;
    if (expresoCount === legs.length) base = 3 + tierBase;
    else if (expresoCount > 0)        base = 4 + tierBase;
    else                              base = 5 + tierBase;

    // "Stops" isn't a fair unit across route types: an expreso stop skips several physical
    // stations while a troncal stop is exactly one, so total stops alone can tie two hubs
    // that cover the same real distance. Riding the expreso further and switching to the
    // troncal for a shorter last stretch is strictly better (troncal is the slow one), so
    // weight non-expreso stops higher than total stops as the finer tiebreaker.
    const slowStops = legs.filter((l) => l.route.type !== 'expreso').reduce((s, l) => s + l.stops, 0);
    const totalStops = legs.reduce((s, l) => s + l.stops, 0);
    // Small penalties: rank backtracking options after non-backtracking, then among hub
    // candidates for the same route pair (deduped below by score) prefer less time on the
    // slow leg, then fewer total stops — otherwise a hub tying on tier+backtrack but with a
    // much longer ride can win arbitrarily.
    return base + backtrackStops * 0.1 + slowStops * 0.001 + totalStops * 0.0001;
  }

  // ── Leg builder ─────────────────────────────────────────────────────────────

  private buildLeg(
    route: Route,
    originId: string,
    destinationId: string,
    now: Date
  ): RouteLeg | null {
    // Time-variant routes: each variant has independent stops + schedules
    if (route.variants?.length) {
      for (const variant of route.variants) {
        if (!this.schedule.isAvailable(variant.schedules, now)) continue;
        const stations = variant.stations;
        const oi = stations.indexOf(originId);
        const di = stations.indexOf(destinationId);
        if (oi === -1 || di === -1 || oi >= di) continue; // variants are unidirectional (forward only)
        return this.makeLegFromArray(route, variant.schedules, stations, oi, di, now, true);
      }
      return null;
    }

    // Bidirectional routes with direction-specific northbound stops
    if (route.bidirectional && route.stationsNorthbound) {
      const nb = route.stationsNorthbound;
      const oi = nb.indexOf(originId);
      const di = nb.indexOf(destinationId);
      if (oi !== -1 && di !== -1 && oi < di) {
        return this.makeLegFromArray(route, route.schedules, nb, oi, di, now, true);
      }
    }

    // Primary stations array (N→S for bidirectional)
    const stations = route.stations;
    const oi = stations.indexOf(originId);
    const di = stations.indexOf(destinationId);
    if (oi === -1 || di === -1 || oi === di) return null;

    const goingForward = oi < di;
    const backward = route.bidirectional && oi > di;
    if (!goingForward && !backward) return null;
    if (backward && route.stationsNorthbound) return null;

    return this.makeLegFromArray(route, route.schedules, stations, oi, di, now, goingForward);
  }

  private makeLegFromArray(
    route: Route,
    schedules: Schedule[],
    stations: string[],
    oi: number,
    di: number,
    now: Date,
    goingForward: boolean
  ): RouteLeg | null {
    const boarding = STATION_MAP.get(stations[oi]);
    const alighting = STATION_MAP.get(stations[di]);
    if (!boarding || !alighting) return null;

    const available = this.schedule.isAvailable(schedules, now);
    const minutesToClose = this.schedule.minutesToClose(schedules, now);
    const minutesToOpen = this.schedule.minutesToOpen(schedules, now);
    const terminalId = goingForward ? stations[stations.length - 1] : stations[0];
    const direction = STATION_MAP.get(terminalId)?.name ?? terminalId;

    return { route, boardingStation: boarding, alightingStation: alighting, available, minutesToClose, minutesToOpen, stops: Math.abs(di - oi), direction };
  }
}


