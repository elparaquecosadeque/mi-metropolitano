import { STATIONS } from './routes';
import { GeoBounds } from './geo';
import gatesData from './gates.json';
import stationMapsData from './station-maps.json';

export interface Gate {
  label: string;
  lat: number;
  lon: number;
}

/**
 * Boarding gate locations, hand-verified in person or against OSM stop_position nodes — never
 * inferred or guessed. Keyed by `${boardingStationId}|${routeId}|${direction}` ('N' = northbound,
 * 'S' = southbound). Missing combinations simply show no gate — that's the expected, honest state
 * until someone confirms it. Edit via ?admin's "Puertas de embarque" panel, or this file directly.
 */
export const GATES: Record<string, Gate> = gatesData;

export interface StationMap {
  /** Relative path under public/, served at the app's base-href regardless of environment. */
  image: string;
  width: number;
  height: number;
  /** Exact geographic bounds of the image crop — printed by scripts/gen-gate-maps.mjs. */
  bounds: GeoBounds;
}

/**
 * One static map per station+direction, showing every confirmed gate there — generated and
 * kept in sync with GATES by `npm run gen:gate-maps` (scripts/gen-gate-maps.mjs), which rewrites
 * this whole file. Never edit station-maps.json by hand.
 */
const STATION_MAPS: Record<string, StationMap> = stationMapsData;

const GEO_POS = new Map<string, number>(STATIONS.map((s, i) => [s.id, i]));

/** Stations are ordered north-to-south; a higher index boarding than alighting means heading north. */
export function legDirection(boardingStationId: string, alightingStationId: string): 'N' | 'S' {
  const boarding = GEO_POS.get(boardingStationId) ?? 0;
  const alighting = GEO_POS.get(alightingStationId) ?? 0;
  return boarding > alighting ? 'N' : 'S';
}

export function gateFor(boardingStationId: string, routeId: string, alightingStationId: string): Gate | undefined {
  const direction = legDirection(boardingStationId, alightingStationId);
  return GATES[`${boardingStationId}|${routeId}|${direction}`];
}

export function stationMapFor(boardingStationId: string, alightingStationId: string): StationMap | undefined {
  return STATION_MAPS[`${boardingStationId}|${legDirection(boardingStationId, alightingStationId)}`];
}
