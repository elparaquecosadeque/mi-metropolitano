import { Route, Station } from '../models/route.model';
import data from './routes.json';

// ponytail: data lives in routes.json — edit that file for any schedule/station change.
export const STATIONS: Station[] = data.stations as Station[];
export const ROUTES: Route[] = data.routes as Route[];
export const STATION_MAP = new Map<string, Station>(STATIONS.map((s) => [s.id, s]));
