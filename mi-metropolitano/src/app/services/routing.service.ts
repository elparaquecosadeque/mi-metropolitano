import { Injectable } from '@angular/core';
import { Route, RouteOption, RouteLeg, Station } from '../models/route.model';
import { ROUTES, STATION_MAP } from '../data/routes';
import { ScheduleService } from './schedule.service';

const TRANSFER_HUB = 'estacion-central';

@Injectable({ providedIn: 'root' })
export class RoutingService {
  constructor(private schedule: ScheduleService) {}

  /**
   * Find all route options between origin and destination, sorted by score.
   * Scores: available direct expreso (1) < available direct troncal (2) <
   *         unavailable direct expreso (3) < transfer (4) < unavailable anything (5+)
   */
  findOptions(originId: string, destinationId: string, now: Date): RouteOption[] {
    if (originId === destinationId) return [];

    const direct = this.findDirect(originId, destinationId, now);
    const transfers = this.findTransfers(originId, destinationId, now);

    return [...direct, ...transfers].sort((a, b) => a.score - b.score);
  }

  private findDirect(originId: string, destinationId: string, now: Date): RouteOption[] {
    const options: RouteOption[] = [];

    for (const route of ROUTES) {
      const leg = this.buildLeg(route, originId, destinationId, now);
      if (!leg) continue;

      const available = leg.available;
      const isExpreso = route.type === 'expreso';
      const score = available
        ? isExpreso ? 1 : 2
        : isExpreso ? 3 : 4;

      options.push({ type: 'direct', legs: [leg], score });
    }

    return options;
  }

  private findTransfers(originId: string, destinationId: string, now: Date): RouteOption[] {
    // Only suggest transfers if no direct available route exists
    const options: RouteOption[] = [];

    for (const leg1Route of ROUTES) {
      const leg1 = this.buildLeg(leg1Route, originId, TRANSFER_HUB, now);
      if (!leg1) continue;

      for (const leg2Route of ROUTES) {
        if (leg2Route.id === leg1Route.id) continue;
        const leg2 = this.buildLeg(leg2Route, TRANSFER_HUB, destinationId, now);
        if (!leg2) continue;

        const bothAvailable = leg1.available && leg2.available;
        const score = bothAvailable ? 5 : 6;

        options.push({ type: 'transfer', legs: [leg1, leg2], score });
      }
    }

    return options;
  }

  /**
   * Returns a RouteLeg if the route serves originId before destinationId, else null.
   * For bidirectional routes, checks both directions.
   */
  private buildLeg(
    route: Route,
    originId: string,
    destinationId: string,
    now: Date
  ): RouteLeg | null {
    const stations = route.stations;
    const oi = stations.indexOf(originId);
    const di = stations.indexOf(destinationId);

    let boarding: Station | undefined;
    let alighting: Station | undefined;

    if (oi !== -1 && di !== -1 && oi < di) {
      boarding = STATION_MAP.get(originId);
      alighting = STATION_MAP.get(destinationId);
    } else if (route.bidirectional && oi !== -1 && di !== -1 && oi > di) {
      boarding = STATION_MAP.get(originId);
      alighting = STATION_MAP.get(destinationId);
    }

    if (!boarding || !alighting) return null;

    const available = this.schedule.isAvailable(route, now);
    const minutesToClose = this.schedule.minutesToClose(route, now);
    const minutesToOpen = this.schedule.minutesToOpen(route, now);

    return { route, boardingStation: boarding, alightingStation: alighting, available, minutesToClose, minutesToOpen };
  }
}
