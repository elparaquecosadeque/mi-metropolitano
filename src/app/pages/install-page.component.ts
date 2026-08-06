import { Component, inject } from '@angular/core';
import { InstallPromptService } from '../services/install-prompt.service';

@Component({
  selector: 'app-install-page',
  standalone: true,
  template: `
    <div class="page">
      <h2>Cómo instalar la app</h2>
      <p class="hint">Añádela a tu pantalla de inicio y ábrela como cualquier otra app, sin buscarla en el navegador cada vez.</p>

      <section class="platform">
        <h3>🤖 Android (Chrome)</h3>
        @if (installPrompt.available()) {
          <button class="install-btn" (click)="installPrompt.promptInstall()">📲 Instalar app</button>
        } @else {
          <ol>
            <li>Toca el menú <strong>⋮</strong> arriba a la derecha</li>
            <li>Selecciona <strong>"Instalar app"</strong> o <strong>"Añadir a pantalla de inicio"</strong></li>
            <li>Confirma tocando <strong>"Instalar"</strong></li>
          </ol>
        }
      </section>

      <section class="platform">
        <h3>🍎 iPhone / iPad (Safari)</h3>
        <ol>
          <li>Toca el ícono de <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba)</li>
          <li>Desplázate y selecciona <strong>"Añadir a pantalla de inicio"</strong></li>
          <li>Toca <strong>"Añadir"</strong> arriba a la derecha</li>
        </ol>
      </section>
    </div>
  `,
  styles: [`
    .page { max-width: 600px; margin: 0 auto; padding: 0 1rem 1rem; }
    h2 { color: var(--c-primary); }
    .hint { color: var(--c-text-muted); font-size: 0.9rem; }
    .platform {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 10px;
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
    }
    h3 { margin-top: 0; }
    ol { padding-left: 1.25rem; line-height: 1.6; }
    .install-btn {
      background: var(--c-primary);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.6rem 1.2rem;
      font-size: 1rem;
      cursor: pointer;
    }
  `],
})
export class InstallPageComponent {
  readonly installPrompt = inject(InstallPromptService);
}
