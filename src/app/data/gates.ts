import { STATIONS } from './routes';

export interface Gate {
  label: string;
  lat: number;
  lon: number;
}

/**
 * Boarding gate locations, hand-verified against OSM stop_position nodes — never inferred or
 * guessed. Keyed by `${boardingStationId}|${routeId}|${direction}` ('N' = northbound, 'S' =
 * southbound). Missing combinations simply show no gate — that's the expected, honest state
 * until someone confirms it (in person, or eventually via ATU/crowdsourcing).
 */
const GATES: Record<string, Gate> = {
  // https://www.openstreetmap.org/node/14161524948 — "Embarque Norte 2"
  'estadio-union|expreso-1|N': { label: 'Puerta Norte 2', lat: -12.1527499, lon: -77.0196784 },
  // https://www.openstreetmap.org/node/9442845256 — "Embarque 1 Norte"
  'estadio-union|ruta-c|N': { label: 'Puerta Norte 1', lat: -12.1529438, lon: -77.019651 },
};

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
