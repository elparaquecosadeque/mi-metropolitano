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
    expect(gate).toEqual({
      label: 'Embarque Norte 2', lat: -12.1527499, lon: -77.0196784,
      photo: 'embarques/embarque-norte-2.webp',
    });
  });

  it('finds the confirmed gate for Ruta C northbound at Estadio Unión', () => {
    const gate = gateFor('estadio-union', 'ruta-c', 'estacion-central');
    expect(gate?.label).toBe('Embarque Norte 1');
  });

  it('returns nothing for a station we have not confirmed — never invents a gate', () => {
    expect(gateFor('naranjal', 'ruta-a', 'matellini')).toBeUndefined();
    expect(gateFor('matellini', 'ruta-a', 'naranjal')).toBeUndefined();
  });

  it('fills in the standardized signage photo from the label, with no per-gate data entry', () => {
    const gate = gateFor('estadio-union', 'ruta-c', 'estacion-central'); // "Embarque Norte 1"
    expect(gate?.photo).toBe('embarques/embarque-norte-1.webp');
  });

  it('leaves photo undefined for a label that is not one of the standardized ones', () => {
    // benavides|expreso-12|S has an unnumbered "Embarque Sur " label — see the admin data-anomaly note.
    const gate = gateFor('benavides', 'expreso-12', '28-de-julio');
    expect(gate?.label).toBe('Embarque Sur ');
    expect(gate?.photo).toBeUndefined();
  });
});
