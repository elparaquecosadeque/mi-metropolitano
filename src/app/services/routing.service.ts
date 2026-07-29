import { Injectable } from '@angular/core';
import { Route, RouteOption, RouteLeg, Station } from '../models/route.model';
import { ROUTES, STATION_MAP } from '../data/routes';
import { ScheduleService } from './schedule.service';

const TRANSFER_HUBS = ['estacion-central', 'naranjal', 'plaza-de-flores'];

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

    // ponytail: filter transfers that backtrack — if a direct exists and the transfer
    // totals >2× its stops, only keep it when it has an expreso leg (genuinely faster)
    const minDirectStops = directs.length
      ? Math.min(...directs.map(o => o.legs[0].stops))
      : Infinity;

    const filteredTransfers = transfers.filter(o => {
      const total = o.legs.reduce((s, l) => s + l.stops, 0);
      if (total <= minDirectStops) return true;
      return o.legs.some(l => l.route.type === 'expreso') && total <= minDirectStops * 2;
    });

    return [...directs, ...filteredTransfers].sort((a, b) => a.score - b.score);
  }

  // ── Direct ──────────────────────────────────────────────────────────────────

  private findDirect(originId: string, destinationId: string, now: Date): RouteOption[] {
    const options: RouteOption[] = [];
    for (const route of ROUTES) {
      const leg = this.buildLeg(route, originId, destinationId, now);
      if (!leg) continue;
      options.push({ type: 'direct', legs: [leg], score: this.scoreDirect(leg) });
    }
    return options;
  }

  // ── 1 transfer ──────────────────────────────────────────────────────────────

  private findOneTransfer(originId: string, destinationId: string, now: Date): RouteOption[] {
    const seen = new Set<string>();
    const options: RouteOption[] = [];

    for (const hub of TRANSFER_HUBS) {
      if (hub === originId || hub === destinationId) continue;

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
            score: this.scoreTransfer([leg1, leg2]),
          });
        }
      }
    }
    return options;
  }

  // ── 2 transfers ─────────────────────────────────────────────────────────────

  private findTwoTransfers(originId: string, destinationId: string, now: Date): RouteOption[] {
    const seen = new Set<string>();
    const options: RouteOption[] = [];

    for (let i = 0; i < TRANSFER_HUBS.length; i++) {
      const hub1 = TRANSFER_HUBS[i];
      if (hub1 === originId || hub1 === destinationId) continue;

      for (let j = 0; j < TRANSFER_HUBS.length; j++) {
        if (i === j) continue;
        const hub2 = TRANSFER_HUBS[j];
        if (hub2 === originId || hub2 === destinationId || hub2 === hub1) continue;

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
                score: this.scoreTransfer([leg1, leg2, leg3]),
              });
            }
          }
        }
      }
    }
    return options;
  }

  // ── Scoring ─────────────────────────────────────────────────────────────────

  /**
   * Score logic (lower = shown first):
   * Available trumps unavailable.
   * Fewer transfers trumps more.
   * More expresos in the journey = faster = better rank within same tier.
   */
  private scoreDirect(leg: RouteLeg): number {
    const avail = leg.available;
    const exp = leg.route.type === 'expreso';
    if (avail && exp)  return 1;
    if (avail && !exp) return 2;
    if (!avail && exp) return 6;
    return 7;
  }

  private scoreTransfer(legs: RouteLeg[]): number {
    const allAvail = legs.every((l) => l.available);
    const expresoCount = legs.filter((l) => l.route.type === 'expreso').length;
    const transferCount = legs.length - 1; // 1 or 2

    // Base: 3–5 for available transfers, 8 for unavailable
    if (!allAvail) return 8;

    // Available: rank by expreso density and transfer count
    // Fewer transfers wins, more expresos wins within same count
    const tierBase = transferCount === 1 ? 0 : 2; // 2-transfer options ranked lower
    if (expresoCount === legs.length) return 3 + tierBase;      // all expresos
    if (expresoCount > 0)             return 4 + tierBase;      // mixed
    return 5 + tierBase;                                         // all troncales
  }

  // ── Leg builder ─────────────────────────────────────────────────────────────

  private buildLeg(
    route: Route,
    originId: string,
    destinationId: string,
    now: Date
  ): RouteLeg | null {
    const stations = route.stations;
    const oi = stations.indexOf(originId);
    const di = stations.indexOf(destinationId);

    if (oi === -1 || di === -1 || oi === di) return null;

    const forward = oi < di;
    const backward = route.bidirectional && oi > di;
    if (!forward && !backward) return null;

    const boarding = STATION_MAP.get(originId);
    const alighting = STATION_MAP.get(destinationId);
    if (!boarding || !alighting) return null;

    const available = this.schedule.isAvailable(route, now);
    const minutesToClose = this.schedule.minutesToClose(route, now);
    const minutesToOpen = this.schedule.minutesToOpen(route, now);

    return { route, boardingStation: boarding, alightingStation: alighting, available, minutesToClose, minutesToOpen, stops: Math.abs(di - oi) };
  }
}

