// Resizes/compresses gate reference photos for mobile data: originals live in
// gate-photos-src/ (kept full-size, for future re-edits) and never ship; this writes the
// served copies to public/embarques/ as WebP.
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'fs';
import path from 'path';

const SRC_DIR = 'gate-photos-src';
const OUT_DIR = 'public/embarques';
const MAX_WIDTH = 960; // plenty of detail for a phone screen at any pixel density, at a fraction of the size
const QUALITY = 72;

mkdirSync(OUT_DIR, { recursive: true });

for (const file of readdirSync(SRC_DIR)) {
  if (!/\.(png|jpe?g)$/i.test(file)) continue;
  const slug = path.parse(file).name;
  const outPath = path.join(OUT_DIR, `${slug}.webp`);
  const info = await sharp(path.join(SRC_DIR, file))
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);
  console.log(`${file} -> ${outPath} (${(info.size / 1024).toFixed(0)} KB)`);
}
