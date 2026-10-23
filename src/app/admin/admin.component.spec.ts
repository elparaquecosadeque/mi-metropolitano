import { AdminComponent } from './admin.component';
import { GATES } from '../data/gates';
import { STATIONS } from '../data/routes';

describe('AdminComponent — gates panel', () => {
  it('loads the existing GATES record as editable rows, split back into station/route/direction', () => {
    const admin = new AdminComponent();
    const rows = admin.gates();
    expect(rows).toHaveLength(Object.keys(GATES).length);
    const row = rows.find(r => r.stationId === 'estadio-union' && r.routeId === 'expreso-1');
    expect(row).toMatchObject({ direction: 'N', label: 'Embarque Norte 2', lat: -12.1527499, lon: -77.0196784 });
  });

  it('splits a pasted "lat, lon" into the two number fields', () => {
    const admin = new AdminComponent();
    admin.pasteLatLon(0, '-12.0433, -77.0283');
    expect(admin.gates()[0]).toMatchObject({ lat: -12.0433, lon: -77.0283 });
  });

  it('parses the Google Maps web DMS format (12°09\'10.0"S 77°01\'11.3"W)', () => {
    const admin = new AdminComponent();
    admin.pasteLatLon(0, `12°09'10.0"S 77°01'11.3"W`);
    const row = admin.gates()[0];
    expect(row.lat).toBeCloseTo(-12.152778, 5);
    expect(row.lon).toBeCloseTo(-77.019806, 5);
  });

  it('ignores a paste that is not two valid numbers, leaving the row untouched', () => {
    const admin = new AdminComponent();
    const before = admin.gates()[0];
    admin.pasteLatLon(0, 'not coordinates');
    expect(admin.gates()[0]).toEqual(before);
  });

  it('adds and removes rows', () => {
    const admin = new AdminComponent();
    const before = admin.gates().length;
    admin.addGate();
    expect(admin.gates()).toHaveLength(before + 1);
    admin.removeGate(before);
    expect(admin.gates()).toHaveLength(before);
  });

  it('generateTemplate fills one blank row per route+direction actually served, skipping rows that exist', () => {
    const admin = new AdminComponent();
    const before = admin.gates().length;
    admin.generateTemplate();
    const rows = admin.gates();
    expect(rows.length).toBeGreaterThan(before);
    // Naranjal has no confirmed gates yet — template should add a blank row for a route that stops there.
    const addedKeys = new Set(rows.map(r => `${r.stationId}|${r.routeId}|${r.direction}`));
    expect(addedKeys.has('naranjal|ruta-a|N')).toBe(true);
    expect(addedKeys.has('naranjal|ruta-a|S')).toBe(true);
    const newRow = rows.find(r => r.stationId === 'naranjal' && r.routeId === 'ruta-a' && r.direction === 'S');
    expect(newRow).toMatchObject({ lat: 0, lon: 0 });
    // Running it twice must not duplicate rows.
    const countAfterFirst = rows.length;
    admin.generateTemplate();
    expect(admin.gates()).toHaveLength(countAfterFirst);
  });

  it('generateTemplate orders rows north-to-south, N before S, troncal before expreso', () => {
    const admin = new AdminComponent();
    admin.generateTemplate();
    const rows = admin.gates();

    const stationIndex = new Map(STATIONS.map((s, i) => [s.id, i]));
    const ranks = rows.map(r => stationIndex.get(r.stationId) ?? 0);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));

    const keyIndex = (k: string) => rows.findIndex(r => `${r.stationId}|${r.routeId}|${r.direction}` === k);
    expect(keyIndex('estadio-union|ruta-c|N')).toBeLessThan(keyIndex('estadio-union|expreso-1|N'));
    expect(keyIndex('estadio-union|expreso-1|N')).toBeLessThan(keyIndex('estadio-union|ruta-c|S'));
    expect(keyIndex('estadio-union|ruta-c|S')).toBeLessThan(keyIndex('estadio-union|expreso-1|S'));
  });

  it('downloadGates skips unfilled (0, 0) placeholder rows so a blank never ships as a real gate', () => {
    const admin = new AdminComponent();
    admin.generateTemplate();
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let captured = '';
    const realBlob = globalThis.Blob;
    const blobSpy = vi.spyOn(globalThis, 'Blob').mockImplementation(function (this: unknown, parts: any) {
      captured = parts[0];
      return new realBlob(parts);
    } as any);

    admin.downloadGates();

    const payload = JSON.parse(captured);
    expect(payload['naranjal|ruta-a|S']).toBeUndefined();
    expect(payload['estadio-union|ruta-c|N']).toBeDefined();
    spy.mockRestore();
    blobSpy.mockRestore();
  });

  it('loadGatesFile replaces the table with an uploaded gates.json', async () => {
    const admin = new AdminComponent();
    const payload = { 'naranjal|ruta-a|S': { label: 'Test', lat: -11.9, lon: -77.05 } };
    const file = new File([JSON.stringify(payload)], 'gates.json', { type: 'application/json' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });

    admin.loadGatesFile({ target: input } as unknown as Event);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(admin.gates()).toHaveLength(1);
    expect(admin.gates()[0]).toMatchObject({ stationId: 'naranjal', routeId: 'ruta-a', direction: 'S', label: 'Test' });
  });

  it('loadGatesFile reports an error on invalid JSON and leaves the table untouched', async () => {
    const admin = new AdminComponent();
    const before = admin.gates();
    const file = new File(['not json'], 'gates.json', { type: 'application/json' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });

    admin.loadGatesFile({ target: input } as unknown as Event);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(admin.importError()).toContain('No se pudo leer');
    expect(admin.gates()).toEqual(before);
  });

  it('downloadGates rebuilds the same key shape the real app reads (station|route|direction)', () => {
    const admin = new AdminComponent();
    const gi = admin.gates().findIndex(g => g.stationId === 'estadio-union' && g.routeId === 'expreso-1' && g.direction === 'N');
    admin.setGateField(gi, 'label', 'Puerta editada');
    const spy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let captured = '';
    const realBlob = globalThis.Blob;
    vi.spyOn(globalThis, 'Blob').mockImplementation(function (this: unknown, parts: any) {
      captured = parts[0];
      return new realBlob(parts);
    } as any);

    admin.downloadGates();

    const payload = JSON.parse(captured);
    expect(payload['estadio-union|expreso-1|N'].label).toBe('Puerta editada');
    spy.mockRestore();
  });
});
