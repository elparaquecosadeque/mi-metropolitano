import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ROUTES, STATION_MAP } from '../data/routes';
import { ScheduleService } from '../services/schedule.service';
import type { Route, RouteType, Schedule } from '../models/route.model';

const TYPE_LABELS: Record<RouteType, string> = {
  expreso: '⚡ Expresos',
  troncal: '🚌 Troncales',
  lechucero: '🦉 Lechuceros',
};

type RouteStatus = 'running' | 'closing-soon' | 'opening-soon' | 'closed';
type FilterMode = 'all' | 'running' | 'closed' | 'soon';

const STATUS_LABEL: Record<RouteStatus, string> = {
  running: 'Funcionando',
  'closing-soon': 'Por finalizar',
  'opening-soon': 'Por comenzar',
  closed: 'No disponible',
};

const STATUS_DOT: Record<RouteStatus, string> = {
  running: '🟢',
  'closing-soon': '🟡',
  'opening-soon': '🟡',
  closed: '⚪',
};

@Component({
  selector: 'app-routes-page',
  standalone: true,
  template: `
    <div class="page">
      <h2>Rutas y horarios</h2>

      <div class="filter-bar">
        <button [class.active]="filterMode() === 'all'" (click)="filterMode.set('all')">Todas</button>
        <button [class.active]="filterMode() === 'running'" (click)="filterMode.set('running')">Funcionando ahora</button>
        <button [class.active]="filterMode() === 'closed'" (click)="filterMode.set('closed')">No disponibles</button>
        <button [class.active]="filterMode() === 'soon'" (click)="filterMode.set('soon')">Por comenzar/finalizar</button>
      </div>

      @for (group of filteredGroups(); track group.type) {
        <section class="group">
          <h3>{{ group.label }}</h3>
          @for (route of group.routes; track route.id) {
            <div class="route-card">
              <button class="route-head" (click)="toggle(route.id)" [style.borderLeftColor]="route.color">
                <span class="route-name">{{ route.name }}</span>
                <span class="status">{{ statusDot(route) }} {{ statusLabel(route) }}</span>
                <span class="chevron">{{ expanded() === route.id ? '▲' : '▼' }}</span>
              </button>

              @if (expanded() === route.id) {
                <div class="route-body">
                  @if (route.variants && route.variants.length) {
                    @for (variant of route.variants; track $index) {
                      <div class="variant">
                        <h4>{{ stopsLabel(variant.stations) }}</h4>
                        @for (sch of variant.schedules; track $index) {
                          <div class="schedule">{{ sch.days.join(', ') }}: {{ sch.start }}–{{ sch.end }}</div>
                        }
                        <ol class="stops">
                          @for (id of variant.stations; track id) { <li>{{ stationName(id) }}</li> }
                        </ol>
                      </div>
                    }
                  } @else {
                    @for (sch of route.schedules; track $index) {
                      <div class="schedule">{{ sch.days.join(', ') }}: {{ sch.start }}–{{ sch.end }}</div>
                    }
                    <h4>{{ stopsLabel(route.stations) }}</h4>
                    <ol class="stops">
                      @for (id of route.stations; track id) { <li>{{ stationName(id) }}</li> }
                    </ol>
                    @if (route.stationsNorthbound) {
                      <h4>{{ stopsLabel(route.stationsNorthbound) }}</h4>
                      <ol class="stops">
                        @for (id of route.stationsNorthbound; track id) { <li>{{ stationName(id) }}</li> }
                      </ol>
                    }
                  }
                </div>
              }
            </div>
          }
        </section>
      } @empty {
        <p class="hint">Ninguna ruta calza con este filtro ahora mismo.</p>
      }
    </div>
  `,
  styles: [`
    .page { max-width: 600px; margin: 0 auto; padding: 0 1rem 1rem; }
    h2 { color: var(--c-primary); }
    .hint { color: var(--c-text-muted); }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-bottom: 1.25rem;
    }
    .filter-bar button {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      color: var(--c-text-muted);
      border-radius: 8px;
      padding: 0.4rem 0.7rem;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .filter-bar button.active {
      background: var(--c-primary);
      border-color: var(--c-primary);
      color: white;
    }
    .group { margin-bottom: 1.5rem; }
    h3 { font-size: 1rem; color: var(--c-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .route-card {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 10px;
      margin-bottom: 0.5rem;
      overflow: hidden;
    }
    .route-head {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: none;
      border: none;
      border-left: 4px solid;
      color: var(--c-text);
      padding: 0.75rem 1rem;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      gap: 0.5rem;
    }
    .route-name { flex-shrink: 0; }
    .status { flex: 1; text-align: right; font-size: 0.8rem; font-weight: normal; color: var(--c-text-muted); }
    .chevron { color: var(--c-text-muted); font-size: 0.8rem; }
    .route-body { padding: 0 1rem 1rem; }
    .schedule { font-size: 0.85rem; color: var(--c-text-muted); margin-bottom: 0.25rem; }
    h4 { font-size: 0.85rem; margin: 0.75rem 0 0.25rem; color: var(--c-accent); }
    .stops { margin: 0; padding-left: 1.25rem; font-size: 0.9rem; }
    .stops li { padding: 0.1rem 0; }
    .variant { margin-bottom: 1rem; }
  `],
})
export class RoutesPageComponent implements OnDestroy {
  private schedule = inject(ScheduleService);

  readonly groups = (['expreso', 'troncal', 'lechucero'] as RouteType[])
    .map(type => ({ type, label: TYPE_LABELS[type], routes: ROUTES.filter((r: Route) => r.type === type) }))
    .filter(g => g.routes.length > 0);

  readonly expanded = signal<string | null>(null);
  readonly filterMode = signal<FilterMode>('all');
  readonly now = signal(new Date());

  private ticker = setInterval(() => this.now.set(new Date()), 60_000);

  ngOnDestroy() {
    clearInterval(this.ticker);
  }

  toggle(id: string) {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  stationName(id: string): string {
    return STATION_MAP.get(id)?.name ?? id;
  }

  stopsLabel(stations: string[]): string {
    return `${this.stationName(stations[0])} → ${this.stationName(stations[stations.length - 1])}`;
  }

  private routeSchedules(route: Route): Schedule[] {
    return route.variants?.length ? route.variants.flatMap(v => v.schedules) : route.schedules;
  }

  routeStatus(route: Route): RouteStatus {
    const schedules = this.routeSchedules(route);
    const now = this.now();
    if (this.schedule.isAvailable(schedules, now)) {
      return this.schedule.minutesToClose(schedules, now) !== null ? 'closing-soon' : 'running';
    }
    return this.schedule.minutesToOpen(schedules, now) !== null ? 'opening-soon' : 'closed';
  }

  statusLabel(route: Route): string {
    return STATUS_LABEL[this.routeStatus(route)];
  }

  statusDot(route: Route): string {
    return STATUS_DOT[this.routeStatus(route)];
  }

  private matchesFilter(status: RouteStatus, filter: FilterMode): boolean {
    switch (filter) {
      case 'all': return true;
      case 'running': return status === 'running';
      case 'closed': return status === 'closed';
      case 'soon': return status === 'closing-soon' || status === 'opening-soon';
    }
  }

  filteredGroups() {
    const filter = this.filterMode();
    return this.groups
      .map(g => ({ ...g, routes: g.routes.filter(r => this.matchesFilter(this.routeStatus(r), filter)) }))
      .filter(g => g.routes.length > 0);
  }
}
