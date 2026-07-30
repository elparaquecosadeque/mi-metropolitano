export type DayGroup = 'lv' | 'sabado' | 'domingo' | 'viernesSabado' | 'lunes-sabado';

export interface Schedule {
  days: DayGroup[];
  start: string; // HH:MM (24h, Lima time)
  end: string;   // HH:MM — if end < start, service spans midnight
}

export type RouteType = 'troncal' | 'expreso' | 'lechucero';

export interface Route {
  id: string;
  name: string;
  type: RouteType;
  color: string;
  /**
   * Station IDs in the order the bus visits them (used for both directions on bidirectional routes).
   * Stored north-to-south for bidirectional; for unidirectional, in actual travel order.
   */
  stations: string[];
  /**
   * Optional: stops in south-to-north travel order, when northbound stops differ from reversing `stations`.
   * Only meaningful when bidirectional: true. If absent, northbound uses `stations` reversed.
   */
  stationsNorthbound?: string[];
  schedules: Schedule[];
  bidirectional: boolean;
}

export interface Station {
  id: string;
  name: string;
}

export interface RouteOption {
  type: 'direct' | 'transfer';
  legs: RouteLeg[];
  score: number; // lower = better
  backtrackStops: number; // stations you go backward before first transfer hub (0 = no backtrack)
}

export interface RouteLeg {
  route: Route;
  boardingStation: Station;
  alightingStation: Station;
  available: boolean;
  minutesToClose: number | null;
  minutesToOpen: number | null;
  stops: number;
  direction: string; // terminal station name in the direction of travel (e.g. "Matellini")
}

export interface Favorite {
  origin: string;
  destination: string;
  label?: string;
}
