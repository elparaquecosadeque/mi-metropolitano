import { Component, ElementRef, OnDestroy, input, output, viewChildren, signal, afterNextRender, inject } from '@angular/core';
import { Gate, StationMap } from '../data/gates';
import { projectToPixel } from '../data/geo';
import { GATE_LOCATION_ENABLED } from '../feature-flags';
import { I18nService } from '../i18n/i18n.service';

export interface GateStep {
  stepLabel: string; // already-translated, e.g. "Step 1" / "How to board"
  isTransfer: boolean;
  stationName: string;
  routeName: string;
  gate: Gate;
  map?: StationMap;
}

type LocateState =
  | { kind: 'idle' }
  | { kind: 'priming' } // our own explainer, shown before the real browser prompt
  | { kind: 'locating' }
  | { kind: 'found'; x: number; y: number; meters: number }
  | { kind: 'out-of-bounds' }
  | { kind: 'error'; text: string };

/** Close enough to the confirmed gate's coordinates to call it "arrived" instead of showing a distance. */
const ARRIVAL_METERS = 15;

/** sessionStorage key handing a prefilled message to the contact page (shared with contact-page.component.ts). */
const REPORT_DRAFT_KEY = 'metro_report_draft';

/**
 * Full-screen page showing where to board, one card per leg that has a confirmed gate. The map
 * is a pre-rendered static image (scripts/gen-gate-maps.mjs) instead of a live tile library — no
 * third-party map requests from the visitor's browser, works offline once cached by the PWA, and
 * the "you are here" dot is just linear interpolation against the image's known bounds
 * (src/app/data/geo.ts) — accurate enough at this ~150m scale.
 *
 * Pushes a history entry on open so the device/browser back action closes it like any other page
 * (there's no Router in this app — see app.ts — so this is the one place that talks to History
 * directly).
 */
@Component({
  selector: 'app-gate-drawer',
  standalone: true,
  template: `
    <div class="page">
      <div class="page-head">
        <button class="back-btn" (click)="goBack()" [attr.aria-label]="i18n.t('gate.backAria')">{{ i18n.t('gate.back') }}</button>
        <span class="label">{{ i18n.t('gate.headLabel') }}</span>
      </div>

      <div class="deck" #deck (scroll)="onScroll()">
        @for (step of steps(); track $index; let i = $index) {
          <article class="gate-card">
            <span class="step" [class.transfer]="step.isTransfer">{{ step.stepLabel }}</span>
            <h2>{{ i18n.t('gate.atStation', { name: step.stationName }) }}</h2>
            <p class="subtitle">{{ i18n.t('gate.approachPrefix') }} <strong>{{ step.gate.label }}</strong> {{ i18n.t('gate.approachSuffix') }} {{ step.routeName }}</p>

            @if (step.map; as map) {
              <div class="map-box" (click)="openFullscreenMap(map, step.stationName)">
                <img [src]="map.image" [alt]="i18n.t('gate.mapAlt', { name: step.stationName })" [width]="map.width" [height]="map.height" />
                @if (locationEnabled) {
                  @let state = locateStates()[i] ?? { kind: 'idle' };
                  @if (state.kind === 'found') {
                    <div class="you-dot" [style.left.%]="(state.x / map.width) * 100" [style.top.%]="(state.y / map.height) * 100"></div>
                  }
                }
                <span class="map-hint" [class.faded]="mapHintDismissed()">{{ i18n.t('gate.mapHint') }}</span>
              </div>
            } @else {
              <p class="map-missing">{{ i18n.t('gate.mapMissing') }}</p>
            }

            @if (step.gate.photo) {
              <button class="photo-btn" (click)="togglePhoto(i)">
                {{ photoOpen()[i] ? i18n.t('gate.hidePhoto') : i18n.t('gate.viewPhoto') }}
              </button>
              @if (photoOpen()[i]) {
                <img class="gate-photo" [src]="step.gate.photo" [alt]="i18n.t('gate.photoAlt', { label: step.gate.label })" />
              }
            }

            <button class="report-btn" (click)="reportWrongGate(i)">{{ i18n.t('gate.reportWrong') }}</button>

            @if (locationEnabled) {
              @switch (locateStates()[i]?.kind ?? 'idle') {
                @case ('priming') {
                  <div class="primer">
                    <p>{{ i18n.t('gate.primerText') }}</p>
                    <div class="primer-actions">
                      <button class="primer-go" (click)="confirmLocate(i)">{{ i18n.t('gate.primerGo') }}</button>
                      <button class="primer-cancel" (click)="setState(i, { kind: 'idle' })">{{ i18n.t('gate.primerCancel') }}</button>
                    </div>
                  </div>
                }
                @default {
                  <button class="locate-btn" [disabled]="locateStates()[i]?.kind === 'locating'" (click)="locate(i)">
                    {{ locateStates()[i]?.kind === 'locating' ? i18n.t('gate.locating') : i18n.t('gate.locateBtn') }}
                  </button>
                  @switch (locateStates()[i]?.kind) {
                    @case ('found') {
                      @if (asFound(locateStates()[i]).meters <= arrivalMeters) {
                        <p class="locate-note ok">{{ i18n.t('gate.arrived') }}</p>
                      } @else {
                        <p class="locate-note ok">{{ i18n.t('gate.distance', { n: asFound(locateStates()[i]).meters }) }}</p>
                      }
                    }
                    @case ('out-of-bounds') {
                      <p class="locate-note">{{ i18n.t('gate.outOfBounds') }}</p>
                    }
                    @case ('error') {
                      <p class="locate-note">{{ asError(locateStates()[i]).text }}</p>
                    }
                  }
                }
              }
            }
          </article>
        }
      </div>

      @if (steps().length > 1) {
        <button class="chevron prev" [disabled]="activeIndex() === 0" (click)="goTo(activeIndex() - 1)" [attr.aria-label]="i18n.t('gate.prevStepAria')">‹</button>
        <button class="chevron next" [disabled]="activeIndex() === steps().length - 1" (click)="goTo(activeIndex() + 1)" [attr.aria-label]="i18n.t('gate.nextStepAria')">›</button>
        <div class="dots">
          @for (step of steps(); track $index; let i = $index) {
            <button class="dot" [class.active]="i === activeIndex()" (click)="goTo(i)" [attr.aria-label]="i18n.t('gate.goToStepAria', { n: i + 1 })"></button>
          }
        </div>
      }
    </div>

    @if (fullscreenMap(); as fs) {
      <div class="map-fullscreen" (click)="closeFullscreenMap()">
        <img [src]="fs.map.image" [alt]="i18n.t('gate.mapAlt', { name: fs.stationName })" />
        <button class="map-fullscreen-close" [attr.aria-label]="i18n.t('gate.closeMapAria')">×</button>
      </div>
    }
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 900; }
    .page {
      position: absolute; inset: 0;
      background: var(--c-surface);
      display: flex;
      flex-direction: column;
      animation: slide-in 0.3s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .page { animation: none; } }

    .page-head {
      display: flex; align-items: center; gap: 0.6rem;
      padding: 0.8rem 0.9rem 0.6rem;
      border-bottom: 1px solid var(--c-border);
    }
    .page-head .label { font-size: 0.78rem; font-weight: 700; color: var(--c-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .back-btn {
      background: var(--c-surface-2); border: 1px solid var(--c-border); color: var(--c-text);
      font: inherit; font-weight: 600; font-size: 0.85rem;
      padding: 0.4rem 0.7rem; border-radius: 8px; line-height: 1;
    }
    .back-btn:hover { border-color: var(--c-primary); color: var(--c-primary); }

    .deck {
      flex: 1;
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
    }
    .deck::-webkit-scrollbar { display: none; }

    .gate-card {
      flex: 0 0 100%;
      scroll-snap-align: center;
      padding: 0.9rem 1rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      overflow-y: auto;
      max-width: 480px;
      margin: 0 auto;
      width: 100%;
    }
    .step { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--c-text-muted); }
    .step.transfer { color: var(--c-accent); }
    h2 { margin: 0; font-size: 1.1rem; line-height: 1.25; text-wrap: balance; }
    .subtitle { margin: 0; font-size: 0.9rem; color: var(--c-text-muted); line-height: 1.4; }
    .subtitle strong { color: var(--c-text); font-weight: 700; }

    .map-box {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 5;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--c-border);
      background: var(--c-surface-2);
      cursor: zoom-in;
    }
    .map-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .map-missing { font-size: 0.85rem; color: var(--c-text-muted); }

    .map-hint {
      position: absolute;
      left: 50%; bottom: 0.6rem;
      transform: translateX(-50%);
      background: color-mix(in srgb, #000 65%, transparent);
      color: #fff;
      font-size: 0.75rem; font-weight: 600;
      padding: 0.4rem 0.7rem;
      border-radius: 999px;
      white-space: nowrap;
      pointer-events: none;
      transition: opacity 0.6s ease;
    }
    .map-hint.faded { opacity: 0; }

    .map-fullscreen {
      position: fixed; inset: 0; z-index: 2000;
      background: color-mix(in srgb, #000 92%, transparent);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
      cursor: zoom-out;
    }
    .map-fullscreen img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }
    .map-fullscreen-close {
      position: absolute;
      top: max(0.8rem, env(safe-area-inset-top, 0px));
      right: max(0.8rem, env(safe-area-inset-right, 0px));
      width: 36px; height: 36px;
      border-radius: 50%;
      background: color-mix(in srgb, #fff 15%, transparent);
      color: #fff;
      border: none;
      font-size: 1.3rem;
      line-height: 1;
      cursor: pointer;
    }

    .you-dot {
      position: absolute;
      width: 16px; height: 16px;
      margin: -8px 0 0 -8px;
      border-radius: 50%;
      background: var(--c-boarding);
      border: 2px solid #fff;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-boarding) 35%, transparent);
    }

    .photo-btn {
      display: flex; align-items: center; justify-content: center;
      width: 100%;
      background: var(--c-surface-2);
      border: 1px solid var(--c-border);
      color: var(--c-text);
      font: inherit; font-weight: 600; font-size: 0.88rem;
      padding: 0.6rem 0.8rem;
      border-radius: 10px;
    }
    .photo-btn:hover { border-color: var(--c-primary); }
    .gate-photo { width: 100%; border-radius: 12px; border: 1px solid var(--c-border); display: block; }

    .primer {
      background: var(--c-surface-2);
      border: 1px solid var(--c-border);
      border-radius: 10px;
      padding: 0.7rem 0.8rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .primer p { margin: 0; font-size: 0.85rem; line-height: 1.4; color: var(--c-text); }
    .primer-actions { display: flex; gap: 0.5rem; }
    .primer-go, .primer-cancel {
      flex: 1;
      font: inherit; font-weight: 600; font-size: 0.85rem;
      padding: 0.5rem 0.7rem;
      border-radius: 8px;
      cursor: pointer;
    }
    .primer-go { background: var(--c-primary); color: #fff; border: none; }
    .primer-cancel { background: transparent; color: var(--c-text-muted); border: 1px solid var(--c-border); }

    .locate-btn {
      display: flex; align-items: center; justify-content: center;
      width: 100%;
      background: var(--c-surface-2);
      border: 1px solid var(--c-border);
      color: var(--c-text);
      font: inherit; font-weight: 600; font-size: 0.88rem;
      padding: 0.65rem 0.8rem;
      border-radius: 10px;
      cursor: pointer;
    }
    .report-btn {
      align-self: flex-start;
      background: transparent;
      border: none;
      color: var(--c-text-muted);
      font: inherit; font-size: 0.78rem;
      text-decoration: underline;
      padding: 0;
      cursor: pointer;
    }
    .report-btn:hover { color: var(--c-danger); }

    .locate-btn:hover { border-color: var(--c-boarding); }
    .locate-btn:disabled { opacity: 0.7; cursor: default; }
    .locate-note { font-size: 0.78rem; line-height: 1.4; color: var(--c-danger); margin: 0; }
    .locate-note.ok { color: var(--c-boarding); }

    .chevron {
      position: absolute; top: 50%; transform: translateY(-50%);
      width: 30px; height: 30px; border-radius: 50%;
      background: color-mix(in srgb, var(--c-bg) 70%, transparent);
      border: 1px solid var(--c-border); color: var(--c-text);
      font-size: 0.9rem; line-height: 1;
    }
    .chevron.prev { left: 6px; }
    .chevron.next { right: 6px; }
    .chevron:disabled { opacity: 0.25; }
    @media (hover: none) { .chevron { display: none; } }

    .dots { position: absolute; left: 0; right: 0; bottom: 0.6rem; display: flex; justify-content: center; gap: 0.4rem; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-border); border: none; padding: 0; }
    .dot.active { background: var(--c-primary); width: 18px; border-radius: 4px; }
  `],
})
export class GateDrawerComponent implements OnDestroy {
  readonly i18n = inject(I18nService);
  steps = input.required<GateStep[]>();
  startIndex = input(0);
  closed = output<void>();

  readonly locationEnabled = GATE_LOCATION_ENABLED;
  readonly arrivalMeters = ARRIVAL_METERS;
  activeIndex = signal(0);
  locateStates = signal<Record<number, LocateState>>({});
  photoOpen = signal<Record<number, boolean>>({});
  mapHintDismissed = signal(false);
  fullscreenMap = signal<{ map: StationMap; stationName: string } | null>(null);

  private deckEl = viewChildren<ElementRef<HTMLDivElement>>('deck');
  private readonly onPopState = () => this.closed.emit();

  constructor() {
    // No Router in this app, so a real page needs to push its own history entry to make the
    // device/browser back action close it instead of leaving the whole app.
    history.pushState({ gateView: true }, '');
    window.addEventListener('popstate', this.onPopState);

    afterNextRender(() => {
      this.activeIndex.set(this.startIndex());
      const deck = this.deckEl()[0]?.nativeElement;
      if (deck) deck.scrollLeft = this.startIndex() * deck.clientWidth;
    });
  }

  ngOnDestroy() {
    window.removeEventListener('popstate', this.onPopState);
  }

  /** Undoes the pushState from open — closing follows from the resulting popstate event. */
  goBack() {
    history.back();
  }

  // Template type-narrowing helpers (Angular's control-flow syntax doesn't narrow union locals).
  asFound(s: LocateState | undefined) { return s as Extract<LocateState, { kind: 'found' }>; }
  asError(s: LocateState | undefined) { return s as Extract<LocateState, { kind: 'error' }>; }

  setState(i: number, state: LocateState) {
    this.locateStates.update((s) => ({ ...s, [i]: state }));
  }

  togglePhoto(i: number) {
    this.photoOpen.update((s) => ({ ...s, [i]: !s[i] }));
  }

  onScroll() {
    const deck = this.deckEl()[0]?.nativeElement;
    if (!deck) return;
    this.activeIndex.set(Math.round(deck.scrollLeft / Math.max(deck.clientWidth, 1)));
    this.mapHintDismissed.set(true);
  }

  goTo(index: number) {
    const deck = this.deckEl()[0]?.nativeElement;
    if (!deck) return;
    deck.scrollTo({ left: index * deck.clientWidth, behavior: 'smooth' });
    this.mapHintDismissed.set(true);
  }

  openFullscreenMap(map: StationMap, stationName: string) {
    this.fullscreenMap.set({ map, stationName });
  }

  closeFullscreenMap() {
    this.fullscreenMap.set(null);
  }

  /** Decides whether to show our own explainer first, skip straight to it, or refuse outright. */
  async locate(i: number) {
    if (!navigator.geolocation) return;
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' });
      if (status?.state === 'denied') {
        this.setState(i, { kind: 'error', text: this.i18n.t('gate.errPermissionBlocked') });
        return;
      }
      if (status?.state === 'granted') return this.confirmLocate(i);
    } catch {
      /* Permissions API not available everywhere — fall through to the primer either way */
    }
    this.setState(i, { kind: 'priming' });
  }

  /** Stashes a report + coords for the contact page to pick up, then navigates there (no Router — full nav). */
  reportWrongGate(i: number) {
    const step = this.steps()[i];
    if (!step) return;
    const header = this.i18n.t('gate.reportWrongStationLine', { station: step.stationName, gate: step.gate.label });

    const send = (body: string) => {
      sessionStorage.setItem(REPORT_DRAFT_KEY, `${header}\n\n${body}`);
      window.location.href = '?page=contacto';
    };

    if (!navigator.geolocation) {
      send(this.i18n.t('gate.reportWrongNoLocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => send(`${this.i18n.t('gate.reportWrongMessage')}${pos.coords.latitude}, ${pos.coords.longitude}`),
      () => send(this.i18n.t('gate.reportWrongNoLocation')),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  confirmLocate(i: number) {
    const step = this.steps()[i];
    if (!step?.map) return;
    this.setState(i, { kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const projected = projectToPixel(pos.coords.latitude, pos.coords.longitude, step.map!.bounds, step.map!.width, step.map!.height);
        if (!projected) return this.setState(i, { kind: 'out-of-bounds' });
        const meters = Math.round(haversine(pos.coords.latitude, pos.coords.longitude, step.gate.lat, step.gate.lon));
        this.setState(i, { kind: 'found', x: projected.x, y: projected.y, meters });
      },
      (err) => {
        const text =
          err.code === err.PERMISSION_DENIED
            ? this.i18n.t('gate.errPermissionDenied')
            : this.i18n.t('gate.errGeneric');
        this.setState(i, { kind: 'error', text });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
