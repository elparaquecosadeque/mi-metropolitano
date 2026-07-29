# Mi Metropolitano

PWA for Lima's Metropolitano BRT system — answers "¿cuál bus tomo ahora?" given an origin and destination station.

**Live**: https://elparaquecosadeque.github.io/mi-metropolitano/

---

## Running locally

```bash
npm install
npm start          # http://localhost:4200
```

## Building

```bash
npm run build      # output: dist/mi-metropolitano/browser/
```

The build script already includes `--base-href /mi-metropolitano/` for GitHub Pages.

## Tests

```bash
npm test
```

18 tests covering: direct route detection, expreso-over-troncal ranking, transfer routing, geographic backtrack filter, backtrackStops computation, and schedule availability.

## Deploying

Push to `main` — GitHub Actions (`.github/workflows/pages.yml`) runs tests, builds, and deploys to GitHub Pages automatically.

## Editing route data

All station and route data lives in one file:

```
src/app/data/routes.json
```

Edit it directly to update schedules, add/remove stations, or correct route stops. No code changes needed — the app imports this JSON at build time.

## Project structure

```
src/app/
  data/
    routes.json          ← single source of truth for all routes + stations
    routes.ts            ← thin TS wrapper exporting STATIONS, ROUTES, STATION_MAP
  models/
    route.model.ts       ← TypeScript interfaces
  services/
    routing.service.ts   ← routing engine (direct, 1-transfer, 2-transfer + geo filter)
    schedule.service.ts  ← availability checks (day-of-week + time windows)
  planner/
    planner.component.*  ← main UI (selectors, results, theme toggle, favorites)
  styles.scss            ← CSS custom properties for dark/light themes
```

