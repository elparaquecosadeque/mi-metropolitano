import { Component, ElementRef, input, output, viewChildren, effect, signal, afterNextRender } from '@angular/core';
import * as L from 'leaflet';
import { Gate } from '../data/gates';

export interface GateStep {
  stepLabel: string; // "Paso 1 de 2" / "Paso 2 de 2 · Trasbordo"
  stationName: string;
  routeName: string;
  gate: Gate;
}

function pin(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'gate-pin',
    html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:${color};
      transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid var(--c-bg)">
      <span style="transform:rotate(45deg);color:#fff;font-weight:700;font-size:11px;font-family:system-ui,sans-serif">${label}</span>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

/**
 * Right-side drawer showing where to board, one card per leg that has a confirmed gate.
 * Real Leaflet + OpenStreetMap tiles (unlike the design mockup, which faked the map because
 * the Artifacts sandbox blocks tile image hosts — no such restriction here).
 */
@Component({
  selector: 'app-gate-drawer',
  standalone: true,
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="drawer" #drawerEl>
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

            <div class="map-box" #mapBox></div>

            <button class="locate-btn" [disabled]="locating() === i" (click)="locate(i)">
              {{ locating() === i ? '📍 Obteniendo tu ubicación…' : '📍 No encuentro mi puerta, guíame' }}
            </button>
            @if (notes()[i]) {
              <p class="locate-note" [class.ok]="notes()[i]!.ok">{{ notes()[i]!.text }}</p>
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
      width: 100%;
      aspect-ratio: 4 / 5;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--c-border);
      background: var(--c-surface-2);
    }

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

  activeIndex = signal(0);
  locating = signal<number | null>(null);
  notes = signal<Record<number, { text: string; ok: boolean }>>({});

  private deckEl = viewChildren<ElementRef<HTMLDivElement>>('deck');
  private mapBoxes = viewChildren<ElementRef<HTMLDivElement>>('mapBox');
  private maps = new Map<number, L.Map>();
  private youMarkers = new Map<number, L.Marker>();
  private youLines = new Map<number, L.Polyline>();

  constructor() {
    effect(() => {
      const boxes = this.mapBoxes();
      const steps = this.steps();
      boxes.forEach((box, i) => {
        if (this.maps.has(i) || !steps[i]) return;
        const { lat, lon } = steps[i].gate;
        const map = L.map(box.nativeElement, { zoomControl: false }).setView([lat, lon], 18);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);
        L.marker([lat, lon], { icon: pin('var(--c-danger)', '🚪') }).addTo(map);
        this.maps.set(i, map);
      });
    });

    afterNextRender(() => {
      this.activeIndex.set(this.startIndex());
      const deck = this.deckEl()[0]?.nativeElement;
      if (deck) deck.scrollLeft = this.startIndex() * deck.clientWidth;
      // After the slide-in transition, Leaflet needs to recompute its size (it was created
      // while off-screen) or tiles render cut off / misaligned.
      setTimeout(() => this.maps.forEach((m) => m.invalidateSize()), 400);
    });
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

  locate(index: number) {
    const step = this.steps()[index];
    const map = this.maps.get(index);
    if (!step || !map || !navigator.geolocation) return;

    this.locating.set(index);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating.set(null);
        const you: L.LatLngTuple = [pos.coords.latitude, pos.coords.longitude];
        const gate: L.LatLngTuple = [step.gate.lat, step.gate.lon];

        this.youMarkers.get(index)?.remove();
        this.youLines.get(index)?.remove();
        this.youMarkers.set(index, L.marker(you, { icon: pin('var(--c-boarding)', '●') }).addTo(map));
        this.youLines.set(index, L.polyline([you, gate], { color: '#74b9ff', dashArray: '6 6', weight: 2 }).addTo(map));
        map.fitBounds(L.latLngBounds([you, gate]), { padding: [28, 28], maxZoom: 19 });

        const meters = Math.round(map.distance(you, gate));
        this.setNote(index, `📍 Estás a ~${meters} m de la puerta (precisión ±${Math.round(pos.coords.accuracy)} m).`, true);
      },
      (err) => {
        this.locating.set(null);
        const text =
          err.code === err.PERMISSION_DENIED
            ? 'No diste permiso de ubicación. Actívalo en los ajustes de tu navegador e inténtalo de nuevo.'
            : 'No pudimos obtener tu ubicación ahora. Inténtalo de nuevo en un momento.';
        this.setNote(index, text, false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  private setNote(index: number, text: string, ok: boolean) {
    this.notes.update((n) => ({ ...n, [index]: { text, ok } }));
  }
}
