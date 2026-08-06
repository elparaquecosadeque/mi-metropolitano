import { Component, signal } from '@angular/core';
import { ROUTES, STATION_MAP } from '../data/routes';
import type { Route, RouteType } from '../models/route.model';

const TYPE_LABELS: Record<RouteType, string> = {
  expreso: '⚡ Expresos',
  troncal: '🚌 Troncales',
  lechucero: '🦉 Lechuceros',
};

@Component({
  selector: 'app-routes-page',
  standalone: true,
  template: `
    <div class="page">
      <h2>Rutas y horarios</h2>

      @for (group of groups; track group.type) {
        <section class="group">
          <h3>{{ group.label }}</h3>
          @for (route of group.routes; track route.id) {
            <div class="route-card">
              <button class="route-head" (click)="toggle(route.id)" [style.borderLeftColor]="route.color">
                <span>{{ route.name }}</span>
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
      }
    </div>
  `,
  styles: [`
    .page { max-width: 600px; margin: 0 auto; padding: 0 1rem 1rem; }
    h2 { color: var(--c-primary); }
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
    }
    .chevron { color: var(--c-text-muted); font-size: 0.8rem; }
    .route-body { padding: 0 1rem 1rem; }
    .schedule { font-size: 0.85rem; color: var(--c-text-muted); margin-bottom: 0.25rem; }
    h4 { font-size: 0.85rem; margin: 0.75rem 0 0.25rem; color: var(--c-accent); }
    .stops { margin: 0; padding-left: 1.25rem; font-size: 0.9rem; }
    .stops li { padding: 0.1rem 0; }
    .variant { margin-bottom: 1rem; }
  `],
})
export class RoutesPageComponent {
  readonly groups = (['expreso', 'troncal', 'lechucero'] as RouteType[])
    .map(type => ({ type, label: TYPE_LABELS[type], routes: ROUTES.filter((r: Route) => r.type === type) }))
    .filter(g => g.routes.length > 0);

  readonly expanded = signal<string | null>(null);

  toggle(id: string) {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  stationName(id: string): string {
    return STATION_MAP.get(id)?.name ?? id;
  }

  stopsLabel(stations: string[]): string {
    return `${this.stationName(stations[0])} → ${this.stationName(stations[stations.length - 1])}`;
  }
}
