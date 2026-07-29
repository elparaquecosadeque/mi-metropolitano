import { Component, signal, computed, effect, OnDestroy, inject, DOCUMENT } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RoutingService } from '../services/routing.service';
import { RouteOption, Favorite, RouteLeg } from '../models/route.model';
import { STATIONS } from '../data/routes';
import { StationPickerComponent } from './station-picker.component';

const FAVORITES_KEY = 'metro_favorites';
const THEME_KEY = 'metro_theme';
const THRESHOLD = 30;

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-planner',
  standalone: true,
  imports: [FormsModule, CommonModule, StationPickerComponent],
  templateUrl: './planner.component.html',
  styleUrl: './planner.component.scss',
})
export class PlannerComponent implements OnDestroy {
  private doc = inject(DOCUMENT);
  readonly stations = STATIONS;

  originId = signal('');
  destinationId = signal('');
  now = signal(new Date());
  isManualTime = signal(false);
  datetimeInputValue = toDatetimeLocal(new Date());
  isLight = signal(localStorage.getItem(THEME_KEY) === 'light');
  withTransfers = signal(true);
  filterMode = signal<'all' | 'fastest'>('all');
  favorites = signal<Favorite[]>(this.loadFavorites());
  copied = signal(false);

  private ticker = setInterval(() => {
    if (!this.isManualTime()) this.now.set(new Date());
  }, 60_000);

  readonly options = computed<RouteOption[]>(() => {
    const o = this.originId();
    const d = this.destinationId();
    if (!o || !d || o === d) return [];
    return this.routing.findOptions(o, d, this.now(), this.withTransfers() ? 2 : 0);
  });

  readonly hasEspresoOptions = computed(() =>
    this.options().some(o => o.legs.some(l => l.route.type === 'expreso'))
  );

  readonly displayOptions = computed<RouteOption[]>(() => {
    const opts = this.options();
    if (this.filterMode() === 'fastest') {
      const fastest = opts.filter(o => o.legs.some(l => l.route.type === 'expreso'));
      return fastest.length > 0 ? fastest : opts;
    }
    return opts;
  });

  readonly hasTransferResults = computed(() =>
    this.options().some(o => o.type === 'transfer')
  );

  constructor(private routing: RoutingService) {
    if (this.isLight()) this.doc.body.classList.add('light');

    // Pre-select stations from URL query params
    const validIds = new Set(STATIONS.map(s => s.id));
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    if (from && validIds.has(from)) this.originId.set(from);
    if (to && validIds.has(to)) this.destinationId.set(to);

    // Keep URL in sync with selected stations
    effect(() => {
      const f = this.originId();
      const t = this.destinationId();
      const search = f && t ? `?from=${f}&to=${t}` : '';
      history.replaceState(null, '', window.location.pathname + search);
    });
  }

  copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  toggleTheme() {
    const next = !this.isLight();
    this.isLight.set(next);
    this.doc.body.classList.toggle('light', next);
    localStorage.setItem(THEME_KEY, next ? 'light' : 'dark');
  }

  ngOnDestroy() {
    clearInterval(this.ticker);
  }

  onDatetimeChange(value: string) {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      this.now.set(parsed);
      this.isManualTime.set(true);
      this.datetimeInputValue = value;
    }
  }

  resetToNow() {
    const now = new Date();
    this.now.set(now);
    this.datetimeInputValue = toDatetimeLocal(now);
    this.isManualTime.set(false);
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

  isSoonClose(leg: RouteLeg): boolean {
    return leg.minutesToClose !== null && leg.minutesToClose <= THRESHOLD;
  }

  isSoonOpen(leg: RouteLeg): boolean {
    return !leg.available && leg.minutesToOpen !== null && leg.minutesToOpen <= THRESHOLD;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  private loadFavorites(): Favorite[] {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
}
