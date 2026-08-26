import { Component, signal, computed, effect, OnDestroy, inject, DOCUMENT, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RoutingService } from '../services/routing.service';
import { RouteOption, Favorite, RouteLeg } from '../models/route.model';
import { STATIONS } from '../data/routes';
import { StationPickerComponent } from './station-picker.component';
import QRCode from 'qrcode';

const FAVORITES_KEY = 'metro_favorites';
const STARRED_KEY = 'metro_starred';
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
  withTransfers = signal(true);
  filterMode = signal<'all' | 'fastest'>('all');
  hideUnavailable = signal(false);
  favorites = signal<Favorite[]>(this.loadFavorites());
  copied = signal(false);
  showQr = signal(false);

  @ViewChild('qrCanvas') private qrCanvas?: ElementRef<HTMLCanvasElement>;
  starredKeys = signal<Set<string>>(this.loadStarred());

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

  readonly hasUnavailableOptions = computed(() =>
    this.options().some(o => !o.legs.every(l => l.available))
  );

  readonly filteredOptions = computed<RouteOption[]>(() => {
    let opts = this.options();
    if (this.filterMode() === 'fastest') {
      const fastest = opts.filter(o => o.legs.some(l => l.route.type === 'expreso'));
      opts = fastest.length > 0 ? fastest : opts;
    }
    if (this.hideUnavailable()) {
      const available = opts.filter(o => o.legs.every(l => l.available));
      opts = available.length > 0 ? available : opts;
    }
    return opts;
  });

  readonly starredOpts = computed<RouteOption[]>(() => {
    const starred = this.starredKeys();
    return this.filteredOptions().filter(opt => starred.has(this.optionKey(opt)));
  });

  readonly unstarredOpts = computed<RouteOption[]>(() => {
    const starred = this.starredKeys();
    return this.filteredOptions().filter(opt => !starred.has(this.optionKey(opt)));
  });

  readonly displayOptions = computed<RouteOption[]>(() =>
    [...this.starredOpts(), ...this.unstarredOpts()]
  );

  readonly hasTransferResults = computed(() =>
    this.options().some(o => o.type === 'transfer')
  );

  constructor(private routing: RoutingService) {
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

  readonly hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  stationName(id: string): string {
    return this.stations.find(s => s.id === id)?.name ?? id;
  }

  qrTitle(): string {
    return `Ruta Metropolitano ${this.stationName(this.originId())} → ${this.stationName(this.destinationId())}`;
  }

  private async renderQrToCanvas(canvas: HTMLCanvasElement): Promise<void> {
    const url = window.location.href;
    const title = this.qrTitle();
    const qrSize = 240;
    const pad = 16;
    const fontSize = 13;
    const lineH = 18;

    // Render QR to offscreen canvas (white bg via margin)
    const tmp = this.doc.createElement('canvas') as HTMLCanvasElement;
    await QRCode.toCanvas(tmp, url, { width: qrSize, margin: 2 });

    // Measure and word-wrap title
    const ctx = canvas.getContext('2d')!;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
    const words = title.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > qrSize) { if (cur) lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);

    const titleH = lines.length * lineH + pad;
    canvas.width  = qrSize + pad * 2;
    canvas.height = titleH + qrSize + pad;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1a1a2e';
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, pad / 2 + i * lineH));

    ctx.drawImage(tmp, pad, titleH);
  }

  generateQr() {
    this.showQr.set(true);
    setTimeout(async () => {
      const canvas = this.qrCanvas?.nativeElement;
      if (canvas) await this.renderQrToCanvas(canvas);
    });
  }

  closeQr() {
    this.showQr.set(false);
  }

  shareNative() {
    navigator.share({ title: this.qrTitle(), url: window.location.href });
  }

  shareVia(platform: 'whatsapp' | 'telegram' | 'facebook' | 'messenger') {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(this.qrTitle());
    const targets: Record<typeof platform, string> = {
      whatsapp:  `https://wa.me/?text=${text}%20${url}`,
      telegram:  `https://t.me/share/url?url=${url}&text=${text}`,
      facebook:  `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      messenger: `fb-messenger://share/?link=${url}`,
    };
    window.open(targets[platform], '_blank', 'noopener');
  }

  downloadQr() {
    const canvas = this.qrCanvas?.nativeElement;
    if (!canvas) return;
    const a = this.doc.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'metropolitano-qr.png';
    a.click();
  }

  copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
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

  trackOption(opt: RouteOption): string {
    return opt.legs.map(l => `${l.route.id}:${l.boardingStation.id}:${l.alightingStation.id}`).join('+');
  }

  optionKey(opt: RouteOption): string {
    // Include boarding station IDs so options via different hubs get distinct star keys
    return opt.legs.map(l => `${l.route.id}@${l.boardingStation.id}`).join('+');
  }

  isStarred(opt: RouteOption): boolean {
    return this.starredKeys().has(this.optionKey(opt));
  }

  toggleStar(opt: RouteOption) {
    const key = this.optionKey(opt);
    const next = new Set(this.starredKeys());
    next.has(key) ? next.delete(key) : next.add(key);
    this.starredKeys.set(next);
    localStorage.setItem(STARRED_KEY, JSON.stringify([...next]));
  }

  private loadStarred(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(STARRED_KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }

  private loadFavorites(): Favorite[] {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
}
