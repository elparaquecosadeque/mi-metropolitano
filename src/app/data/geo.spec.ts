import { projectToPixel } from './geo';

const BOUNDS = { north: -12.0, south: -12.01, west: -77.01, east: -77.0 };

describe('projectToPixel', () => {
  it('places the center of the bounds at the center of the image', () => {
    const p = projectToPixel(-12.005, -77.005, BOUNDS, 100, 100);
    expect(p?.x).toBeCloseTo(50);
    expect(p?.y).toBeCloseTo(50);
  });

  it('places the north-west corner at the top-left pixel', () => {
    const p = projectToPixel(BOUNDS.north, BOUNDS.west, BOUNDS, 100, 100);
    expect(p).toEqual({ x: 0, y: 0 });
  });

  it('returns null outside the bounds — the "can\'t find you on this map" case', () => {
    expect(projectToPixel(-11.9, -77.005, BOUNDS, 100, 100)).toBeNull(); // too far north
    expect(projectToPixel(-12.005, -76.9, BOUNDS, 100, 100)).toBeNull(); // too far east
  });
});
