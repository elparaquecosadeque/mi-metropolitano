import { Route, Station } from '../models/route.model';

// All stations ordered roughly north to south along the main corridor.
// ponytail: hardcoded from screenshots + official Metropolitano data; update this file if schedules change.
export const STATIONS: Station[] = [
  // Comas branch (northernmost)
  { id: 'chimpu-ocllo', name: 'Terminal Chimpu Ocllo' },
  { id: 'los-incas', name: 'Los Incas' },
  { id: 'andres-belaunde', name: 'Andres Belaunde' },
  { id: '22-de-agosto', name: '22 de Agosto' },
  { id: 'las-vegas', name: 'Las Vegas' },
  { id: 'universidad', name: 'Universidad' },
  // Naranjal terminal
  { id: 'naranjal', name: 'Naranjal' },
  // Main north trunk
  { id: 'izaguirre', name: 'Izaguirre' },
  { id: 'pacifico', name: 'Pacífico' },
  { id: 'independencia', name: 'Independencia' },
  { id: 'tomas-valle', name: 'Tomás Valle' },
  { id: 'uni', name: 'UNI' },
  { id: 'caqueta', name: 'Caquetá' },
  // Centro
  { id: '2-de-mayo', name: '2 de Mayo' },
  { id: 'quilca', name: 'Quilca' },
  { id: 'ramon-castilla', name: 'Ramón Castilla' },
  { id: 'tacna', name: 'Tacna' },
  { id: 'jiron-union', name: 'Jiron de la Unión' },
  { id: 'estacion-central', name: 'Estación Central' },
  // South zone
  { id: 'estadio-nacional', name: 'Estadio Nacional' },
  { id: 'javier-prado', name: 'Javier Prado' },
  { id: 'canada', name: 'Canadá' },
  { id: 'canaval-moreyra', name: 'Canaval y Moreyra' },
  { id: 'aramburu', name: 'Aramburu' },
  { id: 'angamos', name: 'Angamos' },
  { id: 'benavides', name: 'Benavides' },
  { id: '28-de-julio', name: '28 de Julio' },
  { id: 'ricardo-palma', name: 'Ricardo Palma' },
  { id: 'bulevar', name: 'Bulevar' },
  { id: 'matellini', name: 'Matellini' },
];

export const STATION_MAP = new Map<string, Station>(
  STATIONS.map((s) => [s.id, s])
);

// Expreso color
const EXP = '#c0392b';
// Troncal color
const TRK = '#27ae60';
// Lechucero (night)
const LEC = '#2c3e50';

export const ROUTES: Route[] = [
  // ── TRONCALES ──────────────────────────────────────────────────────────────
  {
    id: 'ruta-a',
    name: 'Ruta A',
    type: 'troncal',
    color: TRK,
    bidirectional: true,
    stations: [
      'naranjal', 'izaguirre', 'pacifico', 'independencia',
      'tomas-valle', 'uni', 'caqueta',
      '2-de-mayo', 'quilca', 'ramon-castilla', 'tacna', 'jiron-union', 'estacion-central',
    ],
    schedules: [
      { days: ['lunes-sabado'], start: '05:00', end: '23:00' },
      { days: ['domingo'], start: '05:00', end: '22:00' },
    ],
  },
  {
    id: 'ruta-b',
    name: 'Ruta B',
    type: 'troncal',
    color: TRK,
    bidirectional: true,
    stations: [
      'chimpu-ocllo', 'los-incas', 'andres-belaunde', '22-de-agosto', 'las-vegas', 'universidad',
      'naranjal', 'izaguirre', 'pacifico', 'independencia',
      'tomas-valle', 'uni', 'caqueta',
      '2-de-mayo', 'quilca', 'ramon-castilla', 'tacna', 'jiron-union', 'estacion-central',
    ],
    schedules: [
      { days: ['lv'], start: '10:00', end: '23:00' },
      { days: ['sabado'], start: '05:00', end: '23:00' },
      { days: ['domingo'], start: '05:00', end: '22:00' },
    ],
  },
  {
    id: 'ruta-c',
    name: 'Ruta C',
    type: 'troncal',
    color: TRK,
    bidirectional: true,
    stations: [
      'ramon-castilla', 'tacna', 'jiron-union', 'estacion-central',
      'estadio-nacional', 'javier-prado', 'canada', 'canaval-moreyra',
      'aramburu', 'angamos', 'benavides', '28-de-julio', 'ricardo-palma', 'bulevar', 'matellini',
    ],
    schedules: [
      { days: ['lunes-sabado'], start: '05:00', end: '23:00' },
      { days: ['domingo'], start: '05:00', end: '22:00' },
    ],
  },
  {
    id: 'ruta-d',
    name: 'Ruta D',
    type: 'troncal',
    color: TRK,
    bidirectional: true,
    stations: [
      'naranjal', 'izaguirre', 'pacifico', 'independencia',
      'tomas-valle', 'uni', 'caqueta',
      'estacion-central',
    ],
    schedules: [
      { days: ['lv'], start: '05:00', end: '10:30' },
    ],
  },

  // ── EXPRESOS ────────────────────────────────────────────────────────────────
  {
    id: 'expreso-1',
    name: 'Expreso 1',
    type: 'expreso',
    color: EXP,
    bidirectional: true,
    stations: [
      'estacion-central', 'estadio-nacional', 'javier-prado',
      'canaval-moreyra', 'angamos', 'benavides', '28-de-julio', 'ricardo-palma', 'bulevar', 'matellini',
    ],
    schedules: [
      { days: ['lv'], start: '05:30', end: '22:30' },
      { days: ['sabado', 'domingo'], start: '06:30', end: '22:30' },
    ],
  },
  {
    id: 'expreso-2',
    name: 'Expreso 2',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Sur (unidirectional, morning peak)
    stations: [
      'naranjal', 'canada', 'javier-prado', 'canaval-moreyra',
      'aramburu', 'angamos', 'benavides',
    ],
    schedules: [
      { days: ['lv'], start: '05:00', end: '09:00' },
      { days: ['sabado'], start: '06:00', end: '09:00' },
    ],
  },
  {
    id: 'expreso-3',
    name: 'Expreso 3',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Sur → Norte (afternoon peak)
    stations: [
      'benavides', 'angamos', 'naranjal',
    ],
    schedules: [
      { days: ['lv'], start: '17:00', end: '21:00' },
      { days: ['sabado'], start: '12:30', end: '15:30' },
    ],
  },
  {
    id: 'expreso-5',
    name: 'Expreso 5',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Sur
    stations: [
      'naranjal', 'izaguirre', 'tomas-valle', 'uni',
      'canada', 'javier-prado', 'canaval-moreyra', 'aramburu', 'angamos', 'benavides',
    ],
    schedules: [
      { days: ['lv'], start: '09:00', end: '17:00' },
      { days: ['sabado'], start: '05:15', end: '20:20' },
    ],
  },
  {
    id: 'expreso-6',
    name: 'Expreso 6',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Sur (morning)
    stations: [
      'izaguirre', 'independencia', 'estacion-central',
      'javier-prado', 'canaval-moreyra', 'aramburu', 'angamos', 'benavides',
    ],
    schedules: [
      { days: ['lv'], start: '05:30', end: '10:00' },
    ],
  },
  {
    id: 'expreso-7',
    name: 'Expreso 7',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Sur (morning peak)
    stations: [
      'tomas-valle', 'estacion-central', 'javier-prado', 'canaval-moreyra',
      'aramburu', 'angamos', 'benavides',
    ],
    schedules: [
      { days: ['lv'], start: '05:30', end: '09:00' },
    ],
  },
  {
    id: 'expreso-8',
    name: 'Expreso 8',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Sur (evening peak)
    stations: [
      'izaguirre', 'independencia', 'tomas-valle', 'uni',
      'canada', 'javier-prado', 'canaval-moreyra', 'aramburu', 'angamos', 'benavides',
    ],
    schedules: [
      { days: ['lv'], start: '17:00', end: '20:20' },
    ],
  },
  {
    id: 'expreso-9',
    name: 'Expreso 9',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Sur (morning peak)
    stations: [
      'uni', 'caqueta', 'canada', 'canaval-moreyra',
      'aramburu', 'angamos', 'benavides',
    ],
    schedules: [
      { days: ['lv'], start: '05:30', end: '09:00' },
    ],
  },
  {
    id: 'expreso-10',
    name: 'Expreso 10',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Centro (morning)
    stations: [
      'naranjal', 'caqueta', 'ramon-castilla', 'tacna', 'jiron-union', 'estacion-central',
    ],
    schedules: [
      { days: ['lv'], start: '06:00', end: '09:00' },
    ],
  },
  {
    id: 'expreso-11',
    name: 'Expreso 11',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Comas → Centro (morning)
    stations: [
      'los-incas', 'andres-belaunde', '22-de-agosto', 'las-vegas',
      'naranjal', 'uni', 'estacion-central',
    ],
    schedules: [
      { days: ['lv'], start: '05:00', end: '10:00' },
    ],
  },
  {
    id: 'expreso-12',
    name: 'Expreso 12',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Centro → Sur (morning)
    stations: [
      'estacion-central', 'estadio-nacional', 'javier-prado', 'canaval-moreyra',
      'aramburu', 'angamos', 'benavides',
    ],
    schedules: [
      { days: ['lv'], start: '05:45', end: '10:00' },
    ],
  },
  {
    id: 'expreso-13',
    name: 'Expreso 13',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Comas → Centro (morning)
    stations: [
      'chimpu-ocllo', 'andres-belaunde', 'uni', 'estacion-central',
    ],
    schedules: [
      { days: ['lv'], start: '05:00', end: '10:00' },
    ],
  },
  {
    id: 'super-expreso',
    name: 'Super Expreso',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Sur (express, morning peak)
    stations: [
      'naranjal', 'canaval-moreyra', 'aramburu', 'angamos', 'benavides',
    ],
    schedules: [
      { days: ['lv'], start: '05:30', end: '09:00' },
      { days: ['sabado'], start: '06:00', end: '09:00' },
    ],
  },
  {
    id: 'super-expreso-norte',
    name: 'Super Expreso Norte',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Norte → Centro (two windows: morning and afternoon)
    stations: [
      'naranjal', '2-de-mayo', 'quilca', 'estacion-central',
    ],
    schedules: [
      { days: ['lv'], start: '05:00', end: '10:00' },
      { days: ['lv'], start: '16:30', end: '20:30' },
    ],
  },
  {
    id: 'super-expreso-norte-comas',
    name: 'Super Expreso Norte (Comas)',
    type: 'expreso',
    color: EXP,
    bidirectional: false,
    // Comas → Centro (morning, very brief)
    stations: [
      '22-de-agosto', 'las-vegas', 'universidad', 'naranjal', 'estacion-central',
    ],
    schedules: [
      { days: ['lv'], start: '06:00', end: '08:00' },
    ],
  },

  // ── LECHUCERO (night service) ───────────────────────────────────────────────
  {
    id: 'lechucero',
    name: 'Lechucero',
    type: 'lechucero',
    color: LEC,
    bidirectional: true,
    // Norte ↔ Sur (spans midnight: 23:30–04:00)
    stations: [
      'naranjal', 'izaguirre', 'tomas-valle', 'uni',
      'estacion-central',
      'canada', 'canaval-moreyra', 'aramburu', 'angamos', 'benavides', 'matellini',
    ],
    schedules: [
      { days: ['viernesSabado'], start: '23:30', end: '04:00' },
    ],
  },
];
