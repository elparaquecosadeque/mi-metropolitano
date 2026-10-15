#!/usr/bin/env node
// Generates the static gate-map PNGs in public/gate-maps/ from real OpenStreetMap tiles.
// One-off/occasional dev-time script — not part of the shipped app, never runs for a visitor.
//
// Usage: node scripts/gen-gate-maps.mjs
//
// To add a new station+direction map, add an entry to MAPS below (center = midpoint of its
// gates, or the single gate's own coords) and re-run. Paste the printed `bounds` into
// src/app/data/gates.ts's matching STATION_MAPS entry.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// ── config: one entry per station+direction, with every confirmed gate shown on it ─────────────
const RADIUS_M = 150; // half-width of the square area covered; height = width * 5/4
const MAPS = [
  {
    key: 'estadio-union-N',
    center: { lat: -12.1528469, lon: -77.0196647 }, // midpoint of the two gates below
    gates: [
      // https://www.openstreetmap.org/node/14161524948
      { label: '2', lat: -12.1527499, lon: -77.0196784, color: '#c0392b' }, // Expreso 1
      // https://www.openstreetmap.org/node/9442845256
      { label: '1', lat: -12.1529438, lon: -77.019651, color: '#1a7a3d' }, // Ruta C
    ],
  },
];

// ── slippy-map tile math — the exact geographic bounds stored for runtime projection come from
// inverse-projecting the real pixel crop below, so they can never drift from the image. ─────────
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tileCache = new Map();

async function fetchTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  // Identify clearly per OSM's tile usage policy — this is a one-off script run, not live traffic.
  const res = await fetch(url, {
    headers: { 'User-Agent': 'mi-metropolitano-gate-maps/1.0 (github.com/elparaquecosadeque/mi-metropolitano)' },
  });
  if (!res.ok) throw new Error(`tile ${key} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  tileCache.set(key, buf);
  await sleep(200); // be polite — this script touches at most a handful of tiles per map
  return buf;
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

async function genMap({ key, center, gates }) {
  const widthM = RADIUS_M * 2;
  const heightM = widthM * 1.25; // 4:5

  // Pick a zoom where the crop lands in a reasonable pixel range.
  let zoom = 19;
  let mpp;
  for (; zoom >= 15; zoom--) {
    mpp = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / 2 ** zoom;
    if (widthM / mpp >= 420) break; // stop once width would be at least ~420px
  }

  const targetW = Math.round(widthM / mpp);
  const targetH = Math.round(heightM / mpp);
  const centerPx = lonLatToWorldPx(center.lon, center.lat, zoom);
  const left = centerPx.x - targetW / 2;
  const top = centerPx.y - targetH / 2;

  const tileMinX = Math.floor(left / 256);
  const tileMinY = Math.floor(top / 256);
  const tileMaxX = Math.floor((left + targetW) / 256);
  const tileMaxY = Math.floor((top + targetH) / 256);

  const composites = [];
  for (let tx = tileMinX; tx <= tileMaxX; tx++) {
    for (let ty = tileMinY; ty <= tileMaxY; ty++) {
      composites.push({ tx, ty, buf: await fetchTile(zoom, tx, ty) });
    }
  }
  const stitchedW = (tileMaxX - tileMinX + 1) * 256;
  const stitchedH = (tileMaxY - tileMinY + 1) * 256;
  const stitched = sharp({ create: { width: stitchedW, height: stitchedH, channels: 4, background: '#e0e0e0' } })
    .composite(composites.map((c) => ({ input: c.buf, left: (c.tx - tileMinX) * 256, top: (c.ty - tileMinY) * 256 })));

  const cropLeft = Math.round(left - tileMinX * 256);
  const cropTop = Math.round(top - tileMinY * 256);

  // The exact geographic bounds of that crop — this is what gets stored for runtime projection,
  // not the rough meters estimate, so the two can never disagree.
  const topLeft = worldPxToLonLat(left, top, zoom);
  const bottomRight = worldPxToLonLat(left + targetW, top + targetH, zoom);
  const bounds = { north: topLeft.lat, south: bottomRight.lat, west: topLeft.lon, east: bottomRight.lon };

  const pins = gates.map((g) => {
    const px = lonLatToWorldPx(g.lon, g.lat, zoom);
    return { input: pinSvg(g.color, g.label), left: Math.round(px.x - left - 13), top: Math.round(px.y - top - 26) };
  });

  const outDir = path.resolve('public/gate-maps');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${key}.png`);

  await stitched
    .extract({ left: cropLeft, top: cropTop, width: targetW, height: targetH })
    .composite(pins)
    .png()
    .toFile(outPath);

  console.log(`✔ ${key}.png  ${targetW}x${targetH}  zoom ${zoom}`);
  console.log(`  bounds: ${JSON.stringify(bounds)}`);
  console.log(`  size: { width: ${targetW}, height: ${targetH} }`);
}

for (const map of MAPS) await genMap(map);

console.log('\nOpen the PNG(s) and check they show real streets, not a blank/grey square —');
console.log("OpenStreetMap silently serves an 'Access blocked' placeholder (HTTP 200!) to IPs it");
console.log('has flagged, instead of a real tile, so a failed fetch will not throw here.');
