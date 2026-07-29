// ponytail: dev-only page, hidden from end users — access via ?admin in URL.
// No backend: edits live in memory; use the download button to write back to routes.json.
import { Component, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { STATIONS, ROUTES } from '../data/routes';
import type { Route, Schedule, DayGroup } from '../models/route.model';

type EditableSchedule = { days: DayGroup[]; start: string; end: string };
type EditableRoute = Omit<Route, 'schedules'> & { schedules: EditableSchedule[] };

const ALL_DAYS: DayGroup[] = ['lv', 'sabado', 'domingo', 'viernesSabado', 'lunes-sabado'];
const DAY_LABELS: Record<DayGroup, string> = {
  'lv': 'L–V', 'sabado': 'Sáb', 'domingo': 'Dom',
  'viernesSabado': 'V–S', 'lunes-sabado': 'L–S',
};

function deepCloneRoutes(): EditableRoute[] {
  return ROUTES.map(r => ({
    ...r,
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
        <h1>🔧 Editor de Rutas</h1>
        <span class="subtitle">{{ routes().length }} rutas · {{ stations.length }} estaciones</span>
        <div class="header-actions">
          <button class="btn-download" (click)="download()">⬇ Descargar routes.json</button>
          <a class="btn-back" href="/">← Volver al app</a>
        </div>
      </header>

      <div class="route-list">
        @for (route of routes(); track route.id; let ri = $index) {
          <div class="route-card">
            <div class="route-header" (click)="toggleExpanded(route.id)">
              <span class="route-badge" [style.background]="route.color">{{ route.name }}</span>
              <span class="route-type">{{ route.type }}</span>
              <span class="route-meta">{{ route.stations.length }} estaciones</span>
              <span class="expand-icon">{{ expanded().has(route.id) ? '▲' : '▼' }}</span>
            </div>

            @if (expanded().has(route.id)) {
              <div class="route-body">
                <!-- Basic properties -->
                <div class="prop-row">
                  <label>Color</label>
                  <input type="color" [ngModel]="route.color"
                    (ngModelChange)="setColor(ri, $event)" />
                  <span class="color-hex">{{ route.color }}</span>
                </div>
                <div class="prop-row">
                  <label>Bidireccional</label>
                  <input type="checkbox" [ngModel]="route.bidirectional"
                    (ngModelChange)="setBidirectional(ri, $event)" />
                  <span class="hint">{{ route.bidirectional ? 'Sí — ida y vuelta' : 'No — solo dirección indicada' }}</span>
                </div>

                <!-- Stations (read-only) -->
                <div class="section-label">Estaciones ({{ route.stations.length }})</div>
                <div class="station-chips">
                  @for (stId of route.stations; track stId; let si = $index) {
                    <span class="chip">{{ si + 1 }}. {{ stationName(stId) }}</span>
                  }
                </div>

                <!-- Schedules -->
                <div class="section-label">Horarios</div>
                <table class="schedule-table">
                  <thead>
                    <tr>
                      @for (d of allDays; track d) {
                        <th>{{ dayLabels[d] }}</th>
                      }
                      <th>Desde</th>
                      <th>Hasta</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (sched of route.schedules; track $index; let si = $index) {
                      <tr>
                        @for (d of allDays; track d) {
                          <td class="day-cell">
                            <input type="checkbox"
                              [ngModel]="sched.days.includes(d)"
                              (ngModelChange)="toggleDay(ri, si, d, $event)" />
                          </td>
                        }
                        <td><input type="time" [ngModel]="sched.start"
                          (ngModelChange)="setSchedField(ri, si, 'start', $event)" /></td>
                        <td><input type="time" [ngModel]="sched.end"
                          (ngModelChange)="setSchedField(ri, si, 'end', $event)" /></td>
                        <td><button class="btn-remove" (click)="removeSched(ri, si)">✕</button></td>
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
    .admin { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 1rem; }
    header { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; border-bottom: 2px solid #ddd; padding-bottom: .75rem; }
    h1 { margin: 0; font-size: 1.4rem; }
    .subtitle { color: #666; font-size: .85rem; }
    .header-actions { margin-left: auto; display: flex; gap: .5rem; }
    .btn-download { background: #2c3e50; color: #fff; border: none; padding: .4rem .9rem; border-radius: 6px; cursor: pointer; font-size: .85rem; }
    .btn-download:hover { background: #1a252f; }
    .btn-back { color: #555; font-size: .85rem; text-decoration: none; padding: .4rem; }
    .route-list { display: flex; flex-direction: column; gap: .5rem; }
    .route-card { border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
    .route-header { display: flex; align-items: center; gap: .75rem; padding: .6rem 1rem; cursor: pointer; background: #f8f8f8; user-select: none; }
    .route-header:hover { background: #f0f0f0; }
    .route-badge { color: #fff; padding: .15rem .5rem; border-radius: 4px; font-size: .8rem; font-weight: 600; }
    .route-type { color: #888; font-size: .8rem; text-transform: uppercase; }
    .route-meta { color: #aaa; font-size: .75rem; }
    .expand-icon { margin-left: auto; color: #888; font-size: .75rem; }
    .route-body { padding: 1rem; display: flex; flex-direction: column; gap: .75rem; }
    .prop-row { display: flex; align-items: center; gap: .75rem; }
    .prop-row label { min-width: 110px; font-size: .85rem; font-weight: 500; color: #555; }
    .color-hex { font-family: monospace; font-size: .8rem; color: #666; }
    .hint { font-size: .8rem; color: #888; }
    .section-label { font-size: .8rem; font-weight: 600; color: #555; text-transform: uppercase; letter-spacing: .04em; margin-top: .25rem; }
    .station-chips { display: flex; flex-wrap: wrap; gap: .3rem; }
    .chip { background: #eef; border: 1px solid #ccd; border-radius: 4px; font-size: .75rem; padding: .1rem .4rem; color: #444; }
    .schedule-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    .schedule-table th { background: #f0f0f0; padding: .3rem .4rem; text-align: center; font-weight: 600; font-size: .75rem; color: #555; }
    .schedule-table td { padding: .25rem .3rem; text-align: center; border-bottom: 1px solid #f0f0f0; }
    .day-cell input[type=checkbox] { cursor: pointer; width: 16px; height: 16px; }
    .schedule-table input[type=time] { border: 1px solid #ddd; border-radius: 4px; padding: .2rem .3rem; font-size: .8rem; width: 90px; }
    .btn-remove { background: none; border: none; color: #c0392b; cursor: pointer; font-size: .9rem; padding: .1rem .3rem; }
    .btn-remove:hover { background: #fdecea; border-radius: 4px; }
    .btn-add { background: none; border: 1px dashed #bbb; border-radius: 6px; color: #555; cursor: pointer; font-size: .8rem; padding: .3rem .7rem; margin-top: .25rem; }
    .btn-add:hover { background: #f5f5f5; border-color: #999; }
  `],
})
export class AdminComponent {
  readonly stations = STATIONS;
  readonly allDays = ALL_DAYS;
  readonly dayLabels = DAY_LABELS;

  private _routes = signal<EditableRoute[]>(deepCloneRoutes());
  readonly routes = this._routes.asReadonly();
  readonly expanded = signal<Set<string>>(new Set());

  private stationNameMap = new Map(STATIONS.map(s => [s.id, s.name]));
  stationName(id: string): string { return this.stationNameMap.get(id) ?? id; }

  toggleExpanded(id: string) {
    const s = new Set(this.expanded());
    s.has(id) ? s.delete(id) : s.add(id);
    this.expanded.set(s);
  }

  // Immutable-style updates on the routes signal
  private update(fn: (routes: EditableRoute[]) => EditableRoute[]) {
    this._routes.update(fn);
  }

  setColor(ri: number, color: string) {
    this.update(rs => rs.map((r, i) => i === ri ? { ...r, color } : r));
  }

  setBidirectional(ri: number, val: boolean) {
    this.update(rs => rs.map((r, i) => i === ri ? { ...r, bidirectional: val } : r));
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
      const schedules = r.schedules.map((s, j) => j === si ? { ...s, [field]: val } : s);
      return { ...r, schedules };
    }));
  }

  addSched(ri: number) {
    this.update(rs => rs.map((r, i) => {
      if (i !== ri) return r;
      return { ...r, schedules: [...r.schedules, { days: ['lv' as DayGroup], start: '05:00', end: '23:00' }] };
    }));
  }

  removeSched(ri: number, si: number) {
    this.update(rs => rs.map((r, i) => {
      if (i !== ri) return r;
      return { ...r, schedules: r.schedules.filter((_, j) => j !== si) };
    }));
  }

  download() {
    const payload = { stations: STATIONS, routes: this._routes() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'routes.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
