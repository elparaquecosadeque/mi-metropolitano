# Handoff — Mi Metropolitano

## What it is

A personal PWA for Lima's Metropolitano BRT system. Given an origin and destination station, it answers "¿qué bus tomo ahorita?" in one tap — showing available routes, schedules, and transfer options ranked by efficiency.

**Live**: https://elparaquecosadeque.github.io/mi-metropolitano/  
**Repo**: https://github.com/elparaquecosadeque/mi-metropolitano

---

## Architecture

Single Angular 22 standalone app. No backend, no API calls — all data is hardcoded in `routes.json` and bundled at build time.

```
Angular 22 (standalone, signals)
  └── PlannerComponent          ← the only real user-facing component
        ├── RoutingService      ← route-finding engine
        ├── ScheduleService     ← availability/timing checks
        └── routes.json         ← all data (stations + routes)
  └── AdminComponent            ← hidden route editor (?admin URL param)
```

PWA via `@angular/pwa` — works offline after first load.

---

## Key files

| File | Purpose |
|------|---------|
| `src/app/data/routes.json` | **Single source of truth** — 44 stations + 19 routes with schedules |
| `src/app/data/routes.ts` | Thin TS wrapper: exports `STATIONS`, `ROUTES`, `STATION_MAP` |
| `src/app/models/route.model.ts` | TypeScript interfaces: `Route`, `Station`, `RouteOption`, `RouteLeg`, `TimeVariant`, `Schedule` |
| `src/app/services/routing.service.ts` | Routing engine (see below) |
| `src/app/services/schedule.service.ts` | Day-of-week + time-window availability |
| `src/app/planner/planner.component.*` | Full UI (selectors, results, theme, favorites, star, QR) |
| `src/app/admin/admin.component.ts` | Hidden route editor (accessed via `?admin`) |
| `src/styles.scss` | CSS custom properties for dark/light themes |
| `.github/workflows/pages.yml` | CI/CD: test → build → deploy to GitHub Pages |

---

## Routing algorithm

`RoutingService.findOptions(originId, destinationId, now, maxTransfers)`

### Geographic positions

The `stations` array in `routes.json` is ordered geographically north-to-south (index 0 = Chimpu Ocllo, index 43 = Matellini). This index is used as each station's geographic position.

### Transfer station computation

At module load, the service computes `ALL_TRANSFER_STATIONS`: every station that appears on ≥2 routes, excluding `tacna` and `jiron-union` (physically split directional platforms where cross-direction transfers aren't practical).

### Geographic hub filter (`isOnPath`)

Before checking a hub, the service verifies it's geographically "on the path":
```
lo = min(originPos, destPos) - 2
hi = max(originPos, destPos) + 2
hub is valid if: lo ≤ hubPos ≤ hi
```
The ±2 tolerance allows expresos that skip a station or two.

### Backtrack detection

For each valid hub, the service computes how many stations you'd go *backward* before reaching it. Stored as `RouteOption.backtrackStops`, shown in the UI as `↩ Retrocedes N estación(es) para conectar`.

### Route-pair deduplication

After collecting all transfer options, `findOneTransfer` and `findTwoTransfers` deduplicate by route-pair key (route IDs only), keeping the best-scored option per pair. This prevents showing visually identical cards for the same route combination via different transfer hubs.

### Scoring (lower = better)

| Score | Meaning |
|-------|---------|
| 1 | Available direct expreso |
| 2 | Available direct troncal/lechucero |
| 3–3.x | Available 1-transfer, all expresos |
| 4–4.x | Available 1-transfer, mixed |
| 5–5.x | Available 1-transfer, all troncales |
| 5–7 | Available 2-transfer options |
| 8 | Any unavailable transfer |
| 6–7 | Unavailable direct routes |

### Direction-specific stops (`stationsNorthbound`)

Some routes stop at different stations depending on direction. `Route.stationsNorthbound?: string[]` holds the S→N stop order. `buildLeg` checks this array first for northbound travel; when present, the primary `stations` array is not reversed.

### Time-variant routes (`variants`)

Some routes (e.g. Expreso 3) run a completely different stop sequence in different time windows. `Route.variants?: TimeVariant[]` — each variant has its own `stations` and `schedules`. When variants are present, `buildLeg` tries each variant in order and uses the first whose schedule is currently active.

---

## Data format (`routes.json`)

```json
{
  "stations": [
    { "id": "naranjal", "name": "Naranjal" }
  ],
  "routes": [
    {
      "id": "ruta-a",
      "name": "Ruta A",
      "type": "troncal",           // "troncal" | "expreso" | "lechucero"
      "color": "#27ae60",
      "bidirectional": true,
      "stations": ["naranjal", "estacion-central"],  // N→S order for bidirectional
      "stationsNorthbound": ["estacion-central", "naranjal"],  // optional: S→N if different stops
      "schedules": [
        { "days": ["lunes-sabado"], "start": "05:00", "end": "23:00" }
      ],
      "variants": [                // optional: replaces stations/schedules when present
        {
          "stations": ["naranjal", "angamos", "benavides"],
          "schedules": [{ "days": ["lv"], "start": "05:30", "end": "09:00" }]
        },
        {
          "stations": ["benavides", "angamos", "naranjal"],
          "schedules": [{ "days": ["lv"], "start": "17:00", "end": "21:00" }]
        }
      ]
    }
  ]
}
```

**Day groups**: `lv` (Mon–Fri), `lunes-sabado` (Mon–Sat), `sabado`, `domingo`, `viernesSabado`

---

## UI features

- **Origin / Destination pickers** — searchable dropdowns; URL params `?from=&to=` enable direct sharing
- **Con trasbordos** toggle — finds 1- and 2-transfer routes
- **⚡ El más rápido** filter — expreso-only results (shown only when relevant)
- **Time override** — plan ahead; amber banner + "Usar hora actual" to reset
- **⭐ Priorizar resultados** — star a result card to pin it to the top; persisted in `localStorage`
  - Two independent `@for` loops (starred / unstarred) eliminate Angular DOM-move artifacts
  - Star key encodes `routeId@boardingStation` per leg — unique per option, no accidental cross-starring
- **📱 Genera QR** — generates QR locally (no external API, uses `qrcode` npm package)
  - Title "Ruta Metropolitano {origen} → {destino}" is burned into the canvas image
  - Share via WhatsApp, Telegram, Facebook, Messenger, or native share API (covers Instagram on mobile)
  - Download as PNG
- **Favorites** — up to 3 saved pairs, `localStorage`
- **Dark/light theme** — `localStorage`
- **Admin editor** (`?admin`) — edit stations, direction-specific stops, time-variant schedules; download updated JSON
- **PWA** — installable, offline-capable

---

## Admin editor (`?admin`)

Append `?admin` to the URL to access the hidden route editor. Features:
- Route cards with editable stations (add / remove / reorder)
- "Paradas distintas por sentido" toggle for bidirectional routes → shows two independent station lists
- "Variantes" mode for time-variant routes → per-variant station list + schedule editor
- Download button exports the current state as `routes.json` — replace `src/app/data/routes.json` in the project

---

## Known limitations / future improvements

- **2-transfer hubs are hardcoded** to 3 stations for performance.
- **`tacna`/`jiron-union` exclusion** — based on user report; verify with ATU official data.
- **No real-time data** — schedules are static; shows what *should* be running, not live GPS positions.
- **Transfer wait time** not modeled — all transfers assumed immediate.
- **Station coordinates** not stored — geographic position uses list-order index as proxy.


## What it is

A personal PWA for Lima's Metropolitano BRT system. Given an origin and destination station, it answers "¿qué bus tomo ahorita?" in one tap — showing available routes, schedules, and transfer options ranked by efficiency.

**Live**: https://elparaquecosadeque.github.io/mi-metropolitano/  
**Repo**: https://github.com/elparaquecosadeque/mi-metropolitano

---

## Architecture

Single Angular 22 standalone app. No backend, no API calls — all data is hardcoded in `routes.json` and bundled at build time.

```
Angular 22 (standalone, signals)
  └── PlannerComponent          ← the only real component
        ├── RoutingService      ← route-finding engine
        ├── ScheduleService     ← availability/timing checks
        └── routes.json         ← all data (stations + routes)
```

PWA via `@angular/pwa` — works offline after first load.

---

## Key files

| File | Purpose |
|------|---------|
| `src/app/data/routes.json` | **Single source of truth** — 44 stations + 20 routes with schedules |
| `src/app/data/routes.ts` | Thin TS wrapper: exports `STATIONS`, `ROUTES`, `STATION_MAP` |
| `src/app/models/route.model.ts` | TypeScript interfaces |
| `src/app/services/routing.service.ts` | Routing engine (see below) |
| `src/app/services/schedule.service.ts` | Day-of-week + time-window availability |
| `src/app/planner/planner.component.*` | Full UI (selectors, results, theme, favorites) |
| `src/styles.scss` | CSS custom properties for dark/light themes |
| `.github/workflows/pages.yml` | CI/CD: test → build → deploy to GitHub Pages |

---

## Routing algorithm

`RoutingService.findOptions(originId, destinationId, now, maxTransfers)`

### Geographic positions

The `stations` array in `routes.json` is ordered geographically north-to-south (index 0 = Chimpu Ocllo, index 43 = Matellini). This index is used as each station's geographic position.

### Transfer station computation

At module load, the service computes `ALL_TRANSFER_STATIONS`: every station that appears on ≥2 routes, excluding `tacna` and `jiron-union` (physically split directional platforms where cross-direction transfers aren't practical). This gives ~42 valid transfer points.

### Geographic hub filter (`isOnPath`)

Before checking a hub, the service verifies it's geographically "on the path":
```
lo = min(originPos, destPos) - 2
hi = max(originPos, destPos) + 2
hub is valid if: lo ≤ hubPos ≤ hi
```
The ±2 tolerance allows expresos that skip a station or two. This prevents suggesting "go north past your destination to catch a bus back south" — the most common source of bad suggestions.

### Backtrack detection

For each valid hub, the service also computes how many stations you'd need to go *backward* before reaching it:
```
goingSouth = destPos > originPos
backtrackStops = goingSouth ? max(0, originPos - hubPos)
                            : max(0, hubPos - originPos)
```
This is stored on `RouteOption.backtrackStops` and:
- Added as a small score penalty (`× 0.1`) so non-backtracking options rank first within the same tier
- Shown in the UI as `↩ Retrocedes N estación(es) para conectar`

### Scoring (lower = better)

| Score | Meaning |
|-------|---------|
| 1 | Available direct expreso |
| 2 | Available direct troncal/lechucero |
| 3–3.x | Available 1-transfer, all expresos (+ backtrack penalty) |
| 4–4.x | Available 1-transfer, mixed (+ backtrack penalty) |
| 5–5.x | Available 1-transfer, all troncales (+ backtrack penalty) |
| 5–7 | Available 2-transfer options (tierBase +2) |
| 8 | Any unavailable transfer |
| 6–7 | Unavailable direct routes |

### Secondary backtrack filter

After all options are found, any transfer with total stops ≥ 1.75× the minimum direct option stops is dropped, unless it contains an expreso leg. This is a secondary defense against edge cases the geographic filter might not catch.

### 2-transfer paths

Only use 3 main hubs (Estación Central, Naranjal, Plaza de Flores) — using all 42 stations would create 42²×20³ ≈ 3.5M iterations. The geographic filter still applies to these hubs.

---

## Data format (`routes.json`)

```json
{
  "stations": [
    { "id": "naranjal", "name": "Naranjal" }
  ],
  "routes": [
    {
      "id": "ruta-a",
      "name": "Ruta A",
      "type": "troncal",           // "troncal" | "expreso" | "lechucero"
      "color": "#27ae60",          // hex color for the route badge
      "bidirectional": true,       // false = one-way only (in listed order)
      "stations": ["naranjal", "estacion-central"],  // ordered north→south for bidirectional
      "schedules": [
        { "days": ["lunes-sabado"], "start": "05:00", "end": "23:00" }
      ]
    }
  ]
}
```

**Day groups**: `lv` (Mon–Fri), `lunes-sabado` (Mon–Sat), `sabado`, `domingo`, `viernesSabado`

**Midnight-spanning windows**: if `end < start` (e.g. `23:30–04:00`), the schedule service handles wrap-around automatically.

---

## UI features

- **Directo / Con trasbordos** toggle — "Con trasbordos" finds both 1- and 2-transfer routes and shows the best
- **El más rápido** filter — when transfer results exist, filters to options with at least one expreso leg
- **Time override** — plan for a future time; amber banner + "Usar hora actual" to reset
- **Dark/light theme** — persisted in `localStorage`
- **Favorites** — up to 3 saved origin/destination pairs, stored in `localStorage`
- **PWA** — installable, works offline

---

## Known limitations / future improvements

- **2-transfer hubs are hardcoded** to 3 stations for performance. Could expand if more complex routes are added.
- **`tacna`/`jiron-union` exclusion** is based on user report of split platforms — verify with ATU official data.
- **Expreso 3 schedule discrepancy** — screenshots show 17:00–21:00 (evening); some sources show 06:00–09:00 (morning). Currently uses screenshot schedule.
- **No real-time data** — schedules are static; the app shows what *should* be running, not live GPS positions.
- **Transfer wait time** not modeled — all transfers assumed to be immediate; in practice there's a wait.
- **Station coordinates** not stored — geographic position uses list-order index as a proxy. Accurate lat/lng would improve routing for any future map view.
