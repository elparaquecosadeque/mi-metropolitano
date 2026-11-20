import { Component, signal, computed, effect, afterNextRender, OnDestroy, inject, DOCUMENT, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { driver, type DriveStep } from 'driver.js';
import { RoutingService } from '../services/routing.service';
import { RouteOption, Favorite, RouteLeg, DayGroup } from '../models/route.model';
import { STATIONS } from '../data/routes';
import { gateFor, stationMapFor } from '../data/gates';
import { StationPickerComponent } from './station-picker.component';
import { GateDrawerComponent, GateStep } from './gate-drawer.component';
import { I18nService } from '../i18n/i18n.service';
import QRCode from 'qrcode';

const FAVORITES_KEY = 'metro_favorites';
const STARRED_KEY = 'metro_starred';
const TOUR_SEEN_KEY = 'metro_tour_seen';
const THRESHOLD = 30;

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-planner',
  standalone: true,
  imports: [FormsModule, CommonModule, StationPickerComponent, GateDrawerComponent],
  templateUrl: './planner.component.html',
  styleUrl: './planner.component.scss',
})
export class PlannerComponent implements OnDestroy {
  private doc = inject(DOCUMENT);
  private titleService = inject(Title);
  private meta = inject(Meta);
  readonly i18n = inject(I18nService);
  readonly stations = STATIONS;

  originId = signal('');
  destinationId = signal('');
  now = signal(new Date());
  isManualTime = signal(false);
  datetimeInputValue = toDatetimeLocal(new Date());
  withTransfers = signal(true);
  filterMode = signal<'all' | 'fastest'>('all');
  hideUnavailable = signal(true);
  favorites = signal<Favorite[]>(this.loadFavorites());
  copied = signal(false);
  showQr = signal(false);
  gateSteps = signal<GateStep[]>([]);
  gateStartIndex = signal(0);

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

    // Keep URL, tab title, and meta description in sync with selected stations
    effect(() => {
      const f = this.originId();
      const t = this.destinationId();
      const search = f && t ? `?from=${f}&to=${t}` : '';
      history.replaceState(null, '', window.location.pathname + search);

      if (f && t) {
        this.titleService.setTitle(`${this.qrTitle()} | Mi Metropolitano`);
        this.meta.updateTag({ name: 'description', content: this.routeMetaDescription(f, t) });
      } else {
        this.titleService.setTitle('Mi Metropolitano');
        this.meta.updateTag({ name: 'description', content: this.defaultMetaDescription() });
      }
    });

    // Guided tour: first visit ever, or re-launched from the menu via ?tour=1
    if (params.get('tour') === '1' || !localStorage.getItem(TOUR_SEEN_KEY)) {
      afterNextRender(() => this.startTour());
    }
  }

  // Kept as plain functions instead of translation keys: the meta description needs the station
  // names spliced in, which the simple {param} substitution in I18nService.t can't do cleanly
  // across every language's word order.
  private routeMetaDescription(fromId: string, toId: string): string {
    const from = this.stationName(fromId);
    const to = this.stationName(toId);
    const byLang: Record<string, string> = {
      es: `Ruta en bus del Metropolitano desde ${from} hasta ${to}: trasbordos, horarios y puerta de embarque.`,
      en: `Metropolitano bus route from ${from} to ${to}: transfers, schedules and boarding gate.`,
      pt: `Rota de ônibus do Metropolitano de ${from} até ${to}: baldeações, horários e portão de embarque.`,
      fr: `Trajet en bus du Metropolitano de ${from} à ${to} : correspondances, horaires et quai d'embarquement.`,
      zh: `Metropolitano 公交线路：从 ${from} 到 ${to}，含换乘、时间表与登车口信息。`,
    };
    return byLang[this.i18n.lang()] ?? byLang['es'];
  }

  private defaultMetaDescription(): string {
    const byLang: Record<string, string> = {
      es: '¿Qué bus del Metropolitano tomo? Encuentra tu ruta entre dos estaciones de Lima, con trasbordos, horarios y la puerta de embarque exacta.',
      en: 'Which Metropolitano bus do I take? Find your route between two Lima stations, with transfers, schedules and the exact boarding gate.',
      pt: 'Qual ônibus do Metropolitano eu pego? Encontre sua rota entre duas estações de Lima, com baldeações, horários e o portão de embarque exato.',
      fr: 'Quel bus du Metropolitano prendre ? Trouvez votre trajet entre deux stations de Lima, avec correspondances, horaires et le quai d\'embarquement exact.',
      zh: '该坐哪辆 Metropolitano 公交？查找利马两个车站之间的线路，包含换乘、时间表和准确的登车口。',
    };
    return byLang[this.i18n.lang()] ?? byLang['es'];
  }

  private startTour() {
    const t = this.i18n.t;
    const steps: DriveStep[] = [
      { element: '.time-selector', popover: { title: t('tour.step1.title'), description: t('tour.step1.desc') } },
      { element: '.toggle-group', popover: { title: t('tour.step2.title'), description: t('tour.step2.desc') } },
      { element: '#origin-picker', popover: { title: t('tour.step3.title'), description: t('tour.step3.desc') } },
      { element: '.swap-btn', popover: { title: t('tour.step4.title'), description: t('tour.step4.desc') } },
      { element: '#destination-picker', popover: { title: t('tour.step5.title'), description: t('tour.step5.desc') } },
    ];
    driver({
      showProgress: true,
      progressText: t('tour.progress'),
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.prev'),
      doneBtnText: t('tour.done'),
      steps,
      onDestroyed: () => localStorage.setItem(TOUR_SEEN_KEY, '1'),
    }).drive();
  }

  formatDays(days: DayGroup[]): string {
    return days.map((d) => this.i18n.t(`days.${d}`)).join(', ');
  }

  readonly hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  stationName(id: string): string {
    return this.stations.find(s => s.id === id)?.name ?? id;
  }

  qrTitle(): string {
    return `${this.i18n.t('planner.routeTitlePrefix')} ${this.stationName(this.originId())} → ${this.stationName(this.destinationId())}`;
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
    return date.toLocaleTimeString(this.i18n.locale, { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString(this.i18n.locale, { weekday: 'short', day: '2-digit', month: 'short' });
  }

  trackOption(opt: RouteOption): string {
    return opt.legs.map(l => `${l.route.id}:${l.boardingStation.id}:${l.alightingStation.id}`).join('+');
  }

  gateLabel(leg: RouteLeg): string | undefined {
    return gateFor(leg.boardingStation.id, leg.route.id, leg.alightingStation.id)?.label;
  }

  /** Opens the gate drawer with every confirmed gate in this itinerary, scrolled to the tapped leg. */
  openGate(opt: RouteOption, legIndex: number) {
    const steps: GateStep[] = [];
    let startIndex = 0;
    opt.legs.forEach((leg, i) => {
      const gate = gateFor(leg.boardingStation.id, leg.route.id, leg.alightingStation.id);
      if (!gate) return;
      if (i === legIndex) startIndex = steps.length;
      const isTransfer = opt.legs.length > 1 && i > 0;
      const stepLabel = opt.legs.length === 1
        ? this.i18n.t('gate.step.board')
        : this.i18n.t('gate.step.n', { n: steps.length + 1 }) + (isTransfer ? this.i18n.t('gate.step.transferSuffix') : '');
      const map = stationMapFor(leg.boardingStation.id, leg.alightingStation.id);
      steps.push({ stepLabel, isTransfer, stationName: leg.boardingStation.name, routeName: leg.route.name, gate, map });
    });
    this.gateSteps.set(steps);
    this.gateStartIndex.set(startIndex);
  }

  closeGate() {
    this.gateSteps.set([]);
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
