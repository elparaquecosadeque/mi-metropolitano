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
// To add a new station+direction map, add an entry to MAPS below (center = midpoint of its
// gates) and re-run. Paste the printed `bounds` into src/app/data/gates.ts's STATION_MAPS entry.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.GEOAPIFY_KEY;
if (!KEY) {
  console.error('Missing GEOAPIFY_KEY. Get a free one at https://www.geoapify.com/ and run:');
  console.error('  GEOAPIFY_KEY=xxxxx node scripts/gen-gate-maps.mjs');
  process.exit(1);
}

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

async function genMap({ key, center, gates }) {
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
  console.log(`  bounds: ${JSON.stringify(bounds)}`);
  console.log(`  size: { width: ${width}, height: ${height} }`);
}

for (const map of MAPS) await genMap(map);
