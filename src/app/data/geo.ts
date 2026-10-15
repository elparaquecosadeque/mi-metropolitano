/**
 * Shared geo math for the static gate maps: the same linear-box projection used to generate
 * each PNG (scripts/gen-gate-maps.mjs) is used here to place the live "you are here" dot on it,
 * so the two can never drift apart. Fine at ~150m scale — no need for proper Mercator distortion
 * correction at this size.
 */
export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Pixel position of (lat, lon) inside an image that was cropped to exactly `bounds`, or `null` if outside it. */
export function projectToPixel(
  lat: number,
  lon: number,
  bounds: GeoBounds,
  width: number,
  height: number,
): { x: number; y: number } | null {
  if (lat > bounds.north || lat < bounds.south || lon < bounds.west || lon > bounds.east) return null;
  const x = ((lon - bounds.west) / (bounds.east - bounds.west)) * width;
  const y = ((bounds.north - lat) / (bounds.north - bounds.south)) * height; // lat decreases downward
  return { x, y };
}
