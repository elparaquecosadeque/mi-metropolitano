import { Component, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RoutingService } from '../services/routing.service';
import { RouteOption, Favorite, RouteLeg } from '../models/route.model';
import { STATIONS } from '../data/routes';

const FAVORITES_KEY = 'metro_favorites';
const THRESHOLD = 30;

@Component({
  selector: 'app-planner',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './planner.component.html',
  styleUrl: './planner.component.scss',
})
export class PlannerComponent implements OnDestroy {
  readonly stations = STATIONS;

  originId = signal('');
  destinationId = signal('');
  now = signal(new Date());
  favorites = signal<Favorite[]>(this.loadFavorites());

  private ticker = setInterval(() => this.now.set(new Date()), 60_000);

  readonly options = computed<RouteOption[]>(() => {
    const o = this.originId();
    const d = this.destinationId();
    if (!o || !d || o === d) return [];
    return this.routing.findOptions(o, d, this.now());
  });

  constructor(private routing: RoutingService) {}

  ngOnDestroy() {
    clearInterval(this.ticker);
  }

  swap() {
    const tmp = this.originId();
    this.originId.set(this.destinationId());
    this.destinationId.set(tmp);
  }

  applyFavorite(fav: Favorite) {
    this.originId.set(fav.origin);
    this.destinationId.set(fav.destination);
  }

  saveFavorite() {
    const o = this.originId();
    const d = this.destinationId();
    if (!o || !d) return;
    const existing = this.favorites();
    if (existing.some((f) => f.origin === o && f.destination === d)) return;
    const updated = [...existing.slice(-2), { origin: o, destination: d }];
    this.favorites.set(updated);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  }

  removeFavorite(index: number) {
    const updated = this.favorites().filter((_, i) => i !== index);
    this.favorites.set(updated);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  }

  favoriteName(fav: Favorite): string {
    const o = STATIONS.find((s) => s.id === fav.origin)?.name ?? fav.origin;
    const d = STATIONS.find((s) => s.id === fav.destination)?.name ?? fav.destination;
    return `${o} → ${d}`;
  }

  // Helpers for template
  isSoonClose(leg: RouteLeg): boolean {
    return leg.minutesToClose !== null && leg.minutesToClose <= THRESHOLD;
  }

  isSoonOpen(leg: RouteLeg): boolean {
    return !leg.available && leg.minutesToOpen !== null && leg.minutesToOpen <= THRESHOLD;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  private loadFavorites(): Favorite[] {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
}
