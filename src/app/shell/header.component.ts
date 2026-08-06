import { Component, inject, signal } from '@angular/core';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    <header>
      <button class="hamburger" (click)="menuOpen.set(!menuOpen())" aria-label="Menú" [attr.aria-expanded]="menuOpen()">☰</button>
      <h1><a href="?">🚌 Metropolitano</a></h1>
      <button class="theme-btn" (click)="theme.toggle()" [title]="theme.isLight() ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'">
        {{ theme.isLight() ? '🌙' : '☀️' }}
      </button>

      @if (menuOpen()) {
        <div class="menu-backdrop" (click)="menuOpen.set(false)"></div>
      }
      <nav class="menu" [class.open]="menuOpen()">
        <a href="?" (click)="menuOpen.set(false)">🏠 Inicio</a>
        <a href="?page=rutas" (click)="menuOpen.set(false)">🗺️ Consulta de rutas</a>
        <a href="?page=contacto" (click)="menuOpen.set(false)">✉️ Contacto / Reporte</a>
        <a href="?page=nosotros" (click)="menuOpen.set(false)">ℹ️ Nosotros</a>
        <a href="?page=instalar" (click)="menuOpen.set(false)">📲 Cómo instalar</a>
      </nav>
    </header>
  `,
  styles: [`
    header {
      position: relative;
      max-width: 600px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      border-bottom: 2px solid var(--c-primary);
      gap: 0.5rem;
    }
    h1 {
      flex: 1;
      text-align: center;
      font-size: 1.4rem;
      margin: 0;
    }
    h1 a {
      color: var(--c-primary);
      text-decoration: none;
    }
    .hamburger, .theme-btn {
      background: transparent;
      border: 1px solid var(--c-border);
      color: var(--c-text-muted);
      border-radius: 8px;
      padding: 0.3rem 0.5rem;
      font-size: 1rem;
      cursor: pointer;
      line-height: 1;
      flex-shrink: 0;
    }
    .hamburger:hover, .theme-btn:hover { border-color: var(--c-primary); color: var(--c-primary); }
    .menu-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10;
    }
    .menu {
      position: absolute;
      top: 100%;
      left: 1rem;
      z-index: 20;
      display: flex;
      flex-direction: column;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 10px;
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transform: translateY(-8px);
      pointer-events: none;
      transition: max-height 0.25s ease, opacity 0.2s ease, transform 0.2s ease;
    }
    .menu.open {
      max-height: 20rem;
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .menu a {
      padding: 0.7rem 1.1rem;
      color: var(--c-text);
      text-decoration: none;
      border-bottom: 1px solid var(--c-border);
      white-space: nowrap;
    }
    .menu a:last-child { border-bottom: none; }
    .menu a:hover { background: var(--c-surface-2); }
  `],
})
export class HeaderComponent {
  readonly theme = inject(ThemeService);
  readonly menuOpen = signal(false);
}
