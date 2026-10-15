import { AdminComponent } from './admin.component';
import { GATES } from '../data/gates';

describe('AdminComponent — gates panel', () => {
  it('loads the existing GATES record as editable rows, split back into station/route/direction', () => {
    const admin = new AdminComponent();
    const rows = admin.gates();
    expect(rows).toHaveLength(Object.keys(GATES).length);
    const row = rows.find(r => r.stationId === 'estadio-union' && r.routeId === 'expreso-1');
    expect(row).toMatchObject({ direction: 'N', label: 'Puerta Norte 2', lat: -12.1527499, lon: -77.0196784 });
  });

  it('splits a pasted "lat, lon" into the two number fields', () => {
    const admin = new AdminComponent();
    admin.pasteLatLon(0, '-12.0433, -77.0283');
    expect(admin.gates()[0]).toMatchObject({ lat: -12.0433, lon: -77.0283 });
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

  it('downloadGates rebuilds the same key shape the real app reads (station|route|direction)', () => {
    const admin = new AdminComponent();
    admin.setGateField(0, 'label', 'Puerta editada');
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
