#!/usr/bin/env node
// Generates the static gate-map PNGs in public/gate-maps/ using Geoapify's Static Maps API
// (free tier, OSM-based tiles, no API key needed in CI since this never runs for a visitor —
// only when adding/updating a station's map). tile.openstreetmap.org's own bot-wall blocks
// scripted downloads outright (HTTP 200 "Access blocked" placeholder) regardless of source IP,
// which is why this doesn't fetch raw tiles anymore.
//
// Usage: GEOAPIFY_KEY=xxxxx node scripts/gen-gate-maps.mjs
// Free key: https://www.geoapify.com/ -> sign up -> Static Maps API -> copy the key.
//
// One station+direction map is generated per group of confirmed gates in src/app/data/gates.json
// (gates sharing the same physical spot, i.e. the same lat/lon, are drawn as a single pin). Add a
// gate via ?admin, download gates.json into src/app/data/, then re-run this script — it regenerates
// every map and rewrites src/app/data/station-maps.json; nothing else needs manual edits.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import GATES from '../src/app/data/gates.json' with { type: 'json' };

const KEY = process.env.GEOAPIFY_KEY;
if (!KEY) {
  console.error('Missing GEOAPIFY_KEY. Get a free one at https://www.geoapify.com/ and run:');
  console.error('  GEOAPIFY_KEY=xxxxx node scripts/gen-gate-maps.mjs');
  process.exit(1);
}

const RADIUS_M = 150; // half-width of the square area covered; height = width * 5/4
const PIN_COLORS = ['#c0392b', '#1a7a3d', '#1f6fb2', '#8e44ad', '#d68910', '#16a085'];

// ── group confirmed gates into one map per station+direction ────────────────────────────────────
function pinLabel(label, fallbackIndex) {
  const m = label.match(/(\d+)\s*$/);
  return m ? m[1] : String(fallbackIndex);
}

function buildMaps() {
  const groups = new Map(); // 'stationId|direction' -> raw gate entries
  for (const key of Object.keys(GATES)) {
    const [stationId, , direction] = key.split('|');
    const gk = `${stationId}|${direction}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(GATES[key]);
  }

  const maps = [];
  for (const [gk, entries] of groups) {
    const [stationId, direction] = gk.split('|');
    const uniq = [];
    const seen = new Set();
    for (const e of entries) {
      const ck = `${e.lat.toFixed(7)},${e.lon.toFixed(7)}`;
      if (seen.has(ck)) continue;
      seen.add(ck);
      uniq.push(e);
    }
    const center = {
      lat: uniq.reduce((s, u) => s + u.lat, 0) / uniq.length,
      lon: uniq.reduce((s, u) => s + u.lon, 0) / uniq.length,
    };
    const gates = uniq.map((u, i) => ({
      label: pinLabel(u.label, i + 1),
      lat: u.lat,
      lon: u.lon,
      color: PIN_COLORS[i % PIN_COLORS.length],
    }));
    maps.push({ stationId, direction, key: `${stationId}-${direction}`, center, gates });
  }
  return maps;
}

function lonLatToWorldPx(lon, lat, zoom) {
  const n = 256 * 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}
function worldPxToLonLat(x, y, zoom) {
  const n = 256 * 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: (latRad * 180) / Math.PI };
}

function pinSvg(color, label) {
  const size = 26;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <g transform="rotate(-45 ${size / 2} ${size / 2})">
        <rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${(size - 2) / 2}" ry="${(size - 2) / 2}"
              fill="${color}" stroke="#1a1a2e" stroke-width="2"/>
      </g>
      <text x="${size / 2}" y="${size / 2 + 4}" text-anchor="middle" font-family="system-ui,sans-serif"
            font-size="11" font-weight="700" fill="#fff">${label}</text>
    </svg>`);
}

async function genMap({ stationId, direction, key, center, gates }) {
  const widthM = RADIUS_M * 2;
  const heightM = widthM * 1.25; // 4:5

  let zoom = 19;
  let mpp;
  for (; zoom >= 15; zoom--) {
    mpp = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** zoom;
    if (widthM / mpp >= 420) break;
  }
  const width = Math.round(widthM / mpp);
  const height = Math.round(heightM / mpp);

  const url =
    `https://maps.geoapify.com/v1/staticmap?style=osm-carto` +
    `&center=lonlat:${center.lon},${center.lat}&zoom=${zoom}` +
    `&width=${width}&height=${height}&format=png&apiKey=${KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geoapify ${key} -> HTTP ${res.status}: ${await res.text()}`);
  const base = Buffer.from(await res.arrayBuffer());

  // Exact bounds of that crop, for runtime's "you are here" projection (src/app/data/geo.ts).
  const centerPx = lonLatToWorldPx(center.lon, center.lat, zoom);
  const topLeft = worldPxToLonLat(centerPx.x - width / 2, centerPx.y - height / 2, zoom);
  const bottomRight = worldPxToLonLat(centerPx.x + width / 2, centerPx.y + height / 2, zoom);
  const bounds = { north: topLeft.lat, south: bottomRight.lat, west: topLeft.lon, east: bottomRight.lon };

  const pins = gates.map((g) => {
    const px = lonLatToWorldPx(g.lon, g.lat, zoom);
    return {
      input: pinSvg(g.color, g.label),
      left: Math.round(px.x - centerPx.x + width / 2 - 13),
      top: Math.round(px.y - centerPx.y + height / 2 - 26),
    };
  });

  const outDir = path.resolve('public/gate-maps');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${key}.png`);
  await sharp(base).composite(pins).png().toFile(outPath);

  console.log(`✔ ${key}.png  ${width}x${height}  zoom ${zoom}`);
  return { stationId, direction, image: `gate-maps/${key}.png`, width, height, bounds };
}

const maps = buildMaps();
const stationMaps = {};
for (const map of maps) {
  const result = await genMap(map);
  stationMaps[`${result.stationId}|${result.direction}`] = {
    image: result.image,
    width: result.width,
    height: result.height,
    bounds: result.bounds,
  };
}

const outFile = path.resolve('src/app/data/station-maps.json');
await writeFile(outFile, JSON.stringify(stationMaps, null, 2) + '\n');
console.log(`\nWrote ${Object.keys(stationMaps).length} entries to src/app/data/station-maps.json`);
