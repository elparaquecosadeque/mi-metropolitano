import { gateFor, legDirection } from './gates';

describe('legDirection', () => {
  it('is northbound when boarding sits south of alighting in the station order', () => {
    // estadio-union is south of estacion-central
    expect(legDirection('estadio-union', 'estacion-central')).toBe('N');
  });

  it('is southbound when boarding sits north of alighting', () => {
    expect(legDirection('estacion-central', 'estadio-union')).toBe('S');
  });
});

describe('gateFor', () => {
  it('finds the confirmed gate for Expreso 1 northbound at Estadio Unión', () => {
    const gate = gateFor('estadio-union', 'expreso-1', 'estacion-central');
    expect(gate).toEqual({ label: 'Puerta Norte 2', lat: -12.1527499, lon: -77.0196784 });
  });

  it('finds the confirmed gate for Ruta C northbound at Estadio Unión', () => {
    const gate = gateFor('estadio-union', 'ruta-c', 'estacion-central');
    expect(gate?.label).toBe('Puerta Norte 1');
  });

  it('returns nothing for a direction/route we have not confirmed — never invents a gate', () => {
    expect(gateFor('estadio-union', 'expreso-1', 'matellini')).toBeUndefined(); // southbound, unconfirmed
    expect(gateFor('benavides', 'ruta-c', 'estadio-union')).toBeUndefined(); // different station entirely
  });
});
