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
}

export interface RouteLeg {
  route: Route;
  boardingStation: Station;
  alightingStation: Station;
  available: boolean;
  minutesToClose: number | null;
  minutesToOpen: number | null;
}

export interface Favorite {
  origin: string;
  destination: string;
  label?: string;
}
