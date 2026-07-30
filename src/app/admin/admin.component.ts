// ponytail: dev-only page, hidden from end users — access via ?admin in URL.
// No backend: edits live in memory; use the download button to write back to routes.json.
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { STATIONS, ROUTES } from '../data/routes';
import type { Station, DayGroup } from '../models/route.model';

type EditableSchedule = { days: DayGroup[]; start: string; end: string };
type EditableRoute = {
  id: string; name: string; type: string; color: string;
  bidirectional: boolean;
  stations: string[];
  stationsNorthbound?: string[];
  schedules: EditableSchedule[];
};

const ALL_DAYS: DayGroup[] = ['lv', 'sabado', 'domingo', 'viernesSabado', 'lunes-sabado'];
const DAY_LABELS: Record<DayGroup, string> = {
  'lv': 'L–V', 'sabado': 'Sab', 'domingo': 'Dom', 'viernesSabado': 'V–S', 'lunes-sabado': 'L–S',
};

function cloneRoutes(): EditableRoute[] {
  return ROUTES.map(r => ({
    ...r,
    stations: [...r.stations],
    stationsNorthbound: r.stationsNorthbound ? [...r.stationsNorthbound] : undefined,
    schedules: r.schedules.map(s => ({ ...s, days: [...s.days] })),
  }));
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="admin">
      <header>
        <h1>Editor de Rutas</h1>
        <span class="subtitle">{{ routes().length }} rutas · {{ editableStations().length }} estaciones</span>
        <div class="header-actions">
          <button class="btn-download" (click)="download()">Descargar routes.json</button>
          <a class="btn-back" href="/">Volver al app</a>
        </div>
      </header>

      <!-- Global stations panel -->
      <div class="panel">
        <div class="panel-header" (click)="showStations.set(!showStations())">
          <span>Estaciones del sistema ({{ editableStations().length }})</span>
          <span class="expand-icon">{{ showStations() ? 'v' : '>' }}</span>
        </div>
        @if (showStations()) {
          <div class="panel-body stations-grid">
            @for (st of editableStations(); track st.id; let si = $index) {
              <div class="station-row">
                <code class="st-id">{{ st.id }}</code>
                <input class="st-name-input" type="text" [ngModel]="st.name"
                  (ngModelChange)="setStationName(si, $event)" />
              </div>
            }
          </div>
        }
      </div>

      <!-- Route cards -->
      <div class="route-list">
        @for (route of routes(); track route.id; let ri = $index) {
          <div class="route-card">
            <div class="route-header" (click)="toggleExpanded(route.id)">
              <span class="route-badge" [style.background]="route.color">{{ route.name }}</span>
              <span class="route-type">{{ route.type }}</span>
              <span class="route-meta">
                {{ route.stations.length }} paradas N-S
                @if (route.stationsNorthbound) { | {{ route.stationsNorthbound.length }} S-N }
              </span>
              <span class="expand-icon">{{ expanded().has(route.id) ? 'v' : '>' }}</span>
            </div>

            @if (expanded().has(route.id)) {
              <div class="route-body">

                <!-- Color + bidirectional -->
                <div class="prop-row">
                  <label>Color</label>
                  <input type="color" [ngModel]="route.color" (ngModelChange)="setColor(ri, $event)" />
                  <code>{{ route.color }}</code>
                </div>
                <div class="prop-row">
                  <label>Bidireccional</label>
                  <input type="checkbox" [ngModel]="route.bidirectional"
                    (ngModelChange)="setBidirectional(ri, $event)" />
                  <span class="hint">{{ route.bidirectional ? 'Si' : 'No' }}</span>
                </div>

                <!-- North-to-south stations -->
                <div class="section-header">
                  <span class="section-label">
                    @if (route.stationsNorthbound) { Norte a Sur } @else { Paradas }
                    ({{ route.stations.length }})
                  </span>
                  @if (route.bidirectional) {
                    <label class="asymmetric-toggle">
                      <input type="checkbox" [ngModel]="!!route.stationsNorthbound"
                        (ngModelChange)="toggleAsymmetric(ri, $event)" />
                      Paradas distintas por sentido
                    </label>
                  }
                </div>
                <div class="editable-stations">
                  @for (stId of route.stations; track $index; let si = $index) {
                    <div class="station-chip">
                      <span class="chip-num">{{ si + 1 }}</span>
                      <span class="chip-name">{{ stationName(stId) }}</span>
                      <div class="chip-actions">
                        <button class="btn-icon" [disabled]="si === 0"
                          (click)="moveStation(ri, 'stations', si, -1)">up</button>
                        <button class="btn-icon" [disabled]="si === route.stations.length - 1"
                          (click)="moveStation(ri, 'stations', si, 1)">dn</button>
                        <button class="btn-icon danger"
                          (click)="removeStation(ri, 'stations', si)">x</button>
                      </div>
                    </div>
                  }
                  <div class="add-station-row">
                    <select (change)="addStation(ri, 'stations', $event)">
                      <option value="">+ Agregar parada</option>
                      @for (st of stationsNotIn(route.stations); track st.id) {
                        <option [value]="st.id">{{ st.name }}</option>
                      }
                    </select>
                  </div>
                </div>

                <!-- South-to-north stations (when asymmetric) -->
                @if (route.stationsNorthbound) {
                  <div class="section-label">Sur a Norte ({{ route.stationsNorthbound.length }})</div>
                  <div class="editable-stations">
                    @for (stId of route.stationsNorthbound; track $index; let si = $index) {
                      <div class="station-chip">
                        <span class="chip-num">{{ si + 1 }}</span>
                        <span class="chip-name">{{ stationName(stId) }}</span>
                        <div class="chip-actions">
                          <button class="btn-icon" [disabled]="si === 0"
                            (click)="moveStation(ri, 'stationsNorthbound', si, -1)">up</button>
                          <button class="btn-icon" [disabled]="si === route.stationsNorthbound!.length - 1"
                            (click)="moveStation(ri, 'stationsNorthbound', si, 1)">dn</button>
                          <button class="btn-icon danger"
                            (click)="removeStation(ri, 'stationsNorthbound', si)">x</button>
                        </div>
                      </div>
                    }
                    <div class="add-station-row">
                      <select (change)="addStation(ri, 'stationsNorthbound', $event)">
                        <option value="">+ Agregar parada</option>
                        @for (st of stationsNotIn(route.stationsNorthbound); track st.id) {
                          <option [value]="st.id">{{ st.name }}</option>
                        }
                      </select>
                    </div>
                  </div>
                }

                <!-- Schedules -->
                <div class="section-label">Horarios</div>
                <table class="schedule-table">
                  <thead><tr>
                    @for (d of allDays; track d) { <th>{{ dayLabels[d] }}</th> }
                    <th>Desde</th><th>Hasta</th><th></th>
                  </tr></thead>
                  <tbody>
                    @for (sched of route.schedules; track $index; let si = $index) {
                      <tr>
                        @for (d of allDays; track d) {
                          <td><input type="checkbox" [ngModel]="sched.days.includes(d)"
                            (ngModelChange)="toggleDay(ri, si, d, $event)" /></td>
                        }
                        <td><input type="time" [ngModel]="sched.start"
                          (ngModelChange)="setSchedField(ri, si, 'start', $event)" /></td>
                        <td><input type="time" [ngModel]="sched.end"
                          (ngModelChange)="setSchedField(ri, si, 'end', $event)" /></td>
                        <td><button class="btn-icon danger" (click)="removeSched(ri, si)">x</button></td>
                      </tr>
                    }
                  </tbody>
                </table>
                <button class="btn-add" (click)="addSched(ri)">+ Agregar horario</button>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    * { box-sizing: border-box; }
    .admin { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 1rem; color: #222; background: #fff; min-height: 100vh; }
    header { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem; border-bottom: 2px solid #ddd; padding-bottom: .75rem; }
    h1 { margin: 0; font-size: 1.4rem; }
    .subtitle { color: #666; font-size: .85rem; flex: 1; }
    .header-actions { display: flex; gap: .5rem; align-items: center; }
    .btn-download { background: #2c3e50; color: #fff; border: none; padding: .4rem .9rem; border-radius: 6px; cursor: pointer; font-size: .85rem; }
    .btn-download:hover { background: #1a252f; }
    .btn-back { color: #555; font-size: .85rem; text-decoration: none; }
    .panel { border: 1px solid #ddd; border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
    .panel-header { display: flex; justify-content: space-between; padding: .6rem 1rem; background: #f4f4f4; cursor: pointer; font-size: .88rem; font-weight: 600; }
    .panel-header:hover { background: #ececec; }
    .panel-body { padding: .75rem 1rem; }
    .stations-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: .3rem; }
    .station-row { display: flex; align-items: center; gap: .5rem; }
    .st-id { font-size: .72rem; color: #888; background: #f0f0f0; border-radius: 3px; padding: .1rem .3rem; min-width: 140px; }
    .st-name-input { border: 1px solid #ddd; border-radius: 4px; padding: .2rem .4rem; font-size: .82rem; flex: 1; }
    .st-name-input:focus { outline: none; border-color: #3498db; }
    .route-list { display: flex; flex-direction: column; gap: .5rem; }
    .route-card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
    .route-header { display: flex; align-items: center; gap: .75rem; padding: .6rem 1rem; cursor: pointer; background: #f8f8f8; user-select: none; }
    .route-header:hover { background: #f0f0f0; }
    .route-badge { color: #fff; padding: .15rem .5rem; border-radius: 4px; font-size: .8rem; font-weight: 600; }
    .route-type { color: #888; font-size: .8rem; text-transform: uppercase; }
    .route-meta { color: #aaa; font-size: .75rem; flex: 1; }
    .expand-icon { color: #888; font-size: .75rem; }
    .route-body { padding: 1rem; display: flex; flex-direction: column; gap: .75rem; }
    .prop-row { display: flex; align-items: center; gap: .75rem; }
    .prop-row label { min-width: 110px; font-size: .85rem; font-weight: 500; color: #555; }
    .hint { font-size: .8rem; color: #888; }
    .section-header { display: flex; align-items: center; gap: 1rem; }
    .section-label { font-size: .8rem; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: .04em; }
    .asymmetric-toggle { display: flex; align-items: center; gap: .35rem; font-size: .8rem; color: #3498db; cursor: pointer; }
    .editable-stations { border: 1px solid #e8e8e8; border-radius: 6px; padding: .4rem; background: #fafafa; display: flex; flex-direction: column; gap: .15rem; }
    .station-chip { display: flex; align-items: center; gap: .4rem; padding: .15rem .3rem; border-radius: 4px; }
    .station-chip:hover { background: #eef0ff; }
    .chip-num { font-size: .7rem; color: #aaa; min-width: 1.6rem; text-align: right; }
    .chip-name { font-size: .8rem; color: #333; flex: 1; }
    .chip-actions { display: flex; gap: .2rem; }
    .btn-icon { background: #fff; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: .7rem; padding: .1rem .4rem; color: #555; }
    .btn-icon:hover:not([disabled]) { background: #eee; }
    .btn-icon[disabled] { opacity: .3; cursor: default; }
    .btn-icon.danger { color: #c0392b; border-color: #f5c6c6; }
    .btn-icon.danger:hover:not([disabled]) { background: #fdecea; }
    .add-station-row { margin-top: .25rem; }
    .add-station-row select { font-size: .8rem; border: 1px dashed #bbb; border-radius: 4px; padding: .2rem .4rem; color: #555; background: #fff; width: 100%; }
    .schedule-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .schedule-table th { background: #f0f0f0; padding: .3rem .4rem; text-align: center; font-size: .75rem; color: #555; font-weight: 600; }
    .schedule-table td { padding: .25rem .3rem; text-align: center; border-bottom: 1px solid #f0f0f0; }
    .schedule-table input[type=time] { border: 1px solid #ddd; border-radius: 4px; padding: .2rem .3rem; font-size: .8rem; width: 90px; }
    .btn-add { background: none; border: 1px dashed #bbb; border-radius: 6px; color: #555; cursor: pointer; font-size: .8rem; padding: .3rem .7rem; }
    .btn-add:hover { background: #f5f5f5; }
  `],
})
export class AdminComponent {
  readonly allDays = ALL_DAYS;
  readonly dayLabels = DAY_LABELS;
  readonly showStations = signal(false);

  private _routes = signal<EditableRoute[]>(cloneRoutes());
  readonly routes = this._routes.asReadonly();
  readonly expanded = signal<Set<string>>(new Set());

  private _stations = signal<Station[]>(STATIONS.map(s => ({ ...s })));
  readonly editableStations = this._stations.asReadonly();

  stationName(id: string): string {
    return this._stations().find(s => s.id === id)?.name ?? id;
  }

  stationsNotIn(arr: string[]): Station[] {
    const set = new Set(arr);
    return this._stations().filter(s => !set.has(s.id));
  }

  toggleExpanded(id: string) {
    const s = new Set(this.expanded());
    s.has(id) ? s.delete(id) : s.add(id);
    this.expanded.set(s);
  }

  setStationName(si: number, name: string) {
    this._stations.update(ss => ss.map((s, i) => i === si ? { ...s, name } : s));
  }

  private update(fn: (rs: EditableRoute[]) => EditableRoute[]) {
    this._routes.update(fn);
  }

  setColor(ri: number, color: string) {
    this.update(rs => rs.map((r, i) => i === ri ? { ...r, color } : r));
  }

  setBidirectional(ri: number, val: boolean) {
    this.update(rs => rs.map((r, i) => i === ri ? { ...r, bidirectional: val } : r));
  }

  toggleAsymmetric(ri: number, checked: boolean) {
    this.update(rs => rs.map((r, i) => {
      if (i !== ri) return r;
      if (checked) return { ...r, stationsNorthbound: [...r.stations].reverse() };
      const { stationsNorthbound, ...rest } = r;
      return rest as EditableRoute;
    }));
  }

  removeStation(ri: number, field: 'stations' | 'stationsNorthbound', si: number) {
    this.update(rs => rs.map((r, i) => {
      if (i !== ri) return r;
      return { ...r, [field]: (r[field] ?? []).filter((_, j) => j !== si) };
    }));
  }

  moveStation(ri: number, field: 'stations' | 'stationsNorthbound', si: number, dir: -1 | 1) {
    this.update(rs => rs.map((r, i) => {
      if (i !== ri) return r;
      const arr = [...(r[field] ?? [])];
      const ti = si + dir;
      if (ti < 0 || ti >= arr.length) return r;
      [arr[si], arr[ti]] = [arr[ti], arr[si]];
      return { ...r, [field]: arr };
    }));
  }

  addStation(ri: number, field: 'stations' | 'stationsNorthbound', event: Event) {
    const sel = event.target as HTMLSelectElement;
    const id = sel.value;
    if (!id) return;
    sel.value = '';
    this.update(rs => rs.map((r, i) => {
      if (i !== ri) return r;
      return { ...r, [field]: [...(r[field] ?? []), id] };
    }));
  }

  toggleDay(ri: number, si: number, day: DayGroup, checked: boolean) {
    this.update(rs => rs.map((r, i) => {
      if (i !== ri) return r;
      const schedules = r.schedules.map((s, j) => {
        if (j !== si) return s;
        const days = checked ? [...s.days, day] : s.days.filter(d => d !== day);
        return { ...s, days } as EditableSchedule;
      });
      return { ...r, schedules };
    }));
  }

  setSchedField(ri: number, si: number, field: 'start' | 'end', val: string) {
    this.update(rs => rs.map((r, i) => {
      if (i !== ri) return r;
      return { ...r, schedules: r.schedules.map((s, j) => j === si ? { ...s, [field]: val } : s) };
    }));
  }

  addSched(ri: number) {
    this.update(rs => rs.map((r, i) => i !== ri ? r : {
      ...r, schedules: [...r.schedules, { days: ['lv' as DayGroup], start: '05:00', end: '23:00' }]
    }));
  }

  removeSched(ri: number, si: number) {
    this.update(rs => rs.map((r, i) => i !== ri ? r : {
      ...r, schedules: r.schedules.filter((_, j) => j !== si)
    }));
  }

  download() {
    const payload = { stations: this._stations(), routes: this._routes() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'routes.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
