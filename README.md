# Mi Metropolitano

PWA for Lima's Metropolitano BRT system — answers "¿cuál bus tomo ahora?" given an origin and destination station.

**Live**: https://elparaquecosadeque.github.io/mi-metropolitano/

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

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

### Admin route editor

Navigate to `?admin` (append `?admin` to the URL) to open a hidden route editor. From there you can:
- Edit station lists (add, remove, reorder)
- Toggle direction-specific stops (`stationsNorthbound`) for bidirectional routes
- Switch a route to time-variant mode and edit each variant's stops + schedule independently
- Download the updated `routes.json` and replace `src/app/data/routes.json` in the project

## App icons

`public/favicon.ico` is the master artwork (a 1254×1254 PNG despite the `.ico` extension). Every other icon —
`public/icons/icon-*.png` (used by `manifest.webmanifest` for Android/desktop install) and
`public/apple-touch-icon.png` (used by iOS "Add to Home Screen") — is generated from it. To regenerate after
changing the master artwork:

```bash
for size in 72 96 128 144 152 192 384 512; do
  ffmpeg -y -i public/favicon.ico -vf "scale=${size}:${size}:flags=lanczos" "public/icons/icon-${size}x${size}.png"
done
ffmpeg -y -i public/favicon.ico -vf "scale=180:180:flags=lanczos" public/apple-touch-icon.png
```

## UI features

- **Origin / Destination pickers** — searchable station dropdowns with URL params (`?from=&to=`) for direct linking
- **Directo / Con trasbordos** toggle — finds both 1- and 2-transfer routes
- **⚡ El más rápido** filter — filters to options with at least one expreso leg (only shown when relevant)
- **Time override** — plan for a future time; amber banner + "Usar hora actual" to reset
- **⭐ Priorizar resultados** — star any result card to pin it to the top of the list; persisted in `localStorage`
- **📱 Genera QR** — generates a QR code (local, no external API) with the route title burned into the image; share via WhatsApp, Telegram, Facebook, Messenger, or native share sheet (covers Instagram on mobile); download as PNG
- **Favorites** — up to 3 saved origin/destination pairs, stored in `localStorage`
- **Dark/light theme** — persisted in `localStorage`
- **PWA** — installable, works offline

## Project structure

```
src/app/
  data/
    routes.json          ← single source of truth for all routes + stations
    routes.ts            ← thin TS wrapper exporting STATIONS, ROUTES, STATION_MAP
  models/
    route.model.ts       ← TypeScript interfaces (Route, Station, RouteOption, RouteLeg, TimeVariant)
  services/
    routing.service.ts   ← routing engine (direct, 1-transfer, 2-transfer + geo filter + dedup)
    schedule.service.ts  ← availability checks (day-of-week + time windows)
  planner/
    planner.component.*  ← main UI (selectors, results, theme, favorites, star, QR)
  admin/
    admin.component.ts   ← hidden route editor (accessed via ?admin)
  styles.scss            ← CSS custom properties for dark/light themes
```

