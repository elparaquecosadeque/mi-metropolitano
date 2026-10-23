import { Component, ElementRef, input, output, viewChildren, signal, afterNextRender } from '@angular/core';
import { Gate, StationMap } from '../data/gates';
import { projectToPixel } from '../data/geo';
import { GATE_LOCATION_ENABLED } from '../feature-flags';

export interface GateStep {
  stepLabel: string; // "Paso 1 de 2" / "Paso 2 de 2 · Trasbordo"
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

/**
 * Right-side drawer showing where to board, one card per leg that has a confirmed gate.
 * The map is a pre-rendered static image (scripts/gen-gate-maps.mjs) instead of a live tile
 * library — no third-party map requests from the visitor's browser, works offline once cached
 * by the PWA, and the "you are here" dot is just linear interpolation against the image's known
 * bounds (src/app/data/geo.ts) — accurate enough at this ~150m scale.
 */
@Component({
  selector: 'app-gate-drawer',
  standalone: true,
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="drawer">
      <div class="drawer-head">
        <span class="label">Cómo llegar a tu bus</span>
        <button class="drawer-close" (click)="closed.emit()" aria-label="Cerrar">✕</button>
      </div>

      <div class="deck" #deck (scroll)="onScroll()">
        @for (step of steps(); track $index; let i = $index) {
          <article class="gate-card">
            <span class="step" [class.transfer]="step.stepLabel.includes('Trasbordo')">{{ step.stepLabel }}</span>
            <h2>En estación {{ step.stationName }}</h2>
            <p class="subtitle">Acércate a la <strong>{{ step.gate.label }}</strong> para tomar {{ step.routeName }}</p>

            @if (step.map; as map) {
              <div class="map-box">
                <img [src]="map.image" [alt]="'Mapa de ' + step.stationName" [width]="map.width" [height]="map.height" />
                @if (locationEnabled) {
                  @let state = locateStates()[i] ?? { kind: 'idle' };
                  @if (state.kind === 'found') {
                    <div class="you-dot" [style.left.%]="(state.x / map.width) * 100" [style.top.%]="(state.y / map.height) * 100"></div>
                  }
                }
              </div>
            } @else {
              <p class="map-missing">Todavía no tenemos un mapa de esta estación — solo el nombre de la puerta.</p>
            }

            @if (locationEnabled) {
              @switch (locateStates()[i]?.kind ?? 'idle') {
                @case ('priming') {
                  <div class="primer">
                    <p>Vamos a pedirte tu ubicación solo para mostrarte qué tan lejos estás de la puerta. No se guarda ni se envía a ningún servidor.</p>
                    <div class="primer-actions">
                      <button class="primer-go" (click)="confirmLocate(i)">Sí, continuar</button>
                      <button class="primer-cancel" (click)="setState(i, { kind: 'idle' })">Ahora no</button>
                    </div>
                  </div>
                }
                @default {
                  <button class="locate-btn" [disabled]="locateStates()[i]?.kind === 'locating'" (click)="locate(i)">
                    {{ locateStates()[i]?.kind === 'locating' ? '📍 Obteniendo tu ubicación…' : '📍 No encuentro mi puerta, guíame' }}
                  </button>
                  @switch (locateStates()[i]?.kind) {
                    @case ('found') {
                      <p class="locate-note ok">📍 Estás a ~{{ asFound(locateStates()[i]).meters }} m de la puerta.</p>
                    }
                    @case ('out-of-bounds') {
                      <p class="locate-note">No pudimos ubicarte en este mapa — pareces estar fuera del área que cubre.</p>
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
        <button class="chevron prev" [disabled]="activeIndex() === 0" (click)="goTo(activeIndex() - 1)" aria-label="Paso anterior">‹</button>
        <button class="chevron next" [disabled]="activeIndex() === steps().length - 1" (click)="goTo(activeIndex() + 1)" aria-label="Paso siguiente">›</button>
        <div class="dots">
          @for (step of steps(); track $index; let i = $index) {
            <button class="dot" [class.active]="i === activeIndex()" (click)="goTo(i)" [attr.aria-label]="'Ir al paso ' + (i + 1)"></button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 900; }
    .backdrop {
      position: absolute; inset: 0;
      background: color-mix(in srgb, #000 42%, transparent);
    }
    .drawer {
      position: absolute; top: 0; right: 0; bottom: 0;
      width: min(87%, 360px);
      background: var(--c-surface);
      border-left: 1px solid var(--c-border);
      box-shadow: -18px 0 40px -14px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      animation: slide-in 0.35s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .drawer { animation: none; } }

    .drawer-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.8rem 0.9rem 0.6rem;
      border-bottom: 1px solid var(--c-border);
    }
    .drawer-head .label { font-size: 0.78rem; font-weight: 700; color: var(--c-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .drawer-close {
      background: var(--c-surface-2); border: 1px solid var(--c-border); color: var(--c-text);
      width: 30px; height: 30px; border-radius: 50%; font-size: 0.9rem; line-height: 1;
    }
    .drawer-close:hover { border-color: var(--c-danger); color: var(--c-danger); }

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
    }
    .map-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .map-missing { font-size: 0.85rem; color: var(--c-text-muted); }

    .you-dot {
      position: absolute;
      width: 16px; height: 16px;
      margin: -8px 0 0 -8px;
      border-radius: 50%;
      background: var(--c-boarding);
      border: 2px solid #fff;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-boarding) 35%, transparent);
    }

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
    .chevron.prev { left: calc(min(87%, 360px) - 36px); }
    .chevron.next { right: 6px; }
    .chevron:disabled { opacity: 0.25; }
    @media (hover: none) { .chevron { display: none; } }

    .dots { position: absolute; left: 0; right: 0; bottom: 0.6rem; display: flex; justify-content: center; gap: 0.4rem; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-border); border: none; padding: 0; }
    .dot.active { background: var(--c-primary); width: 18px; border-radius: 4px; }
  `],
})
export class GateDrawerComponent {
  steps = input.required<GateStep[]>();
  startIndex = input(0);
  closed = output<void>();

  readonly locationEnabled = GATE_LOCATION_ENABLED;
  activeIndex = signal(0);
  locateStates = signal<Record<number, LocateState>>({});

  private deckEl = viewChildren<ElementRef<HTMLDivElement>>('deck');

  constructor() {
    afterNextRender(() => {
      this.activeIndex.set(this.startIndex());
      const deck = this.deckEl()[0]?.nativeElement;
      if (deck) deck.scrollLeft = this.startIndex() * deck.clientWidth;
    });
  }

  // Template type-narrowing helpers (Angular's control-flow syntax doesn't narrow union locals).
  asFound(s: LocateState | undefined) { return s as Extract<LocateState, { kind: 'found' }>; }
  asError(s: LocateState | undefined) { return s as Extract<LocateState, { kind: 'error' }>; }

  setState(i: number, state: LocateState) {
    this.locateStates.update((s) => ({ ...s, [i]: state }));
  }

  onScroll() {
    const deck = this.deckEl()[0]?.nativeElement;
    if (!deck) return;
    this.activeIndex.set(Math.round(deck.scrollLeft / Math.max(deck.clientWidth, 1)));
  }

  goTo(index: number) {
    const deck = this.deckEl()[0]?.nativeElement;
    if (!deck) return;
    deck.scrollTo({ left: index * deck.clientWidth, behavior: 'smooth' });
  }

  /** Decides whether to show our own explainer first, skip straight to it, or refuse outright. */
  async locate(i: number) {
    if (!navigator.geolocation) return;
    try {
      const status = await navigator.permissions?.query({ name: 'geolocation' });
      if (status?.state === 'denied') {
        this.setState(i, {
          kind: 'error',
          text: 'Ya bloqueaste el permiso de ubicación para este sitio. Actívalo desde el ícono junto a la dirección (⚙️/🔒) → Permisos del sitio → Ubicación.',
        });
        return;
      }
      if (status?.state === 'granted') return this.confirmLocate(i);
    } catch {
      /* Permissions API not available everywhere — fall through to the primer either way */
    }
    this.setState(i, { kind: 'priming' });
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
            ? 'No diste permiso de ubicación. Puedes intentarlo de nuevo cuando quieras.'
            : 'No pudimos obtener tu ubicación ahora. Inténtalo de nuevo en un momento.';
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
