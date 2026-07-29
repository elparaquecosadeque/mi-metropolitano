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
