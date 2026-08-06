import { Component, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { APP_VERSION } from '../version';

@Component({
  selector: 'app-footer',
  standalone: true,
  template: `
    <footer>
      Mi Metropolitano v{{ version }}.
      @if (updateAvailable()) {
        hay una nueva versión,
        <button (click)="update()">actualiza aquí</button>
      }
    </footer>
  `,
  styles: [`
    footer {
      max-width: 600px;
      margin: 0 auto;
      padding: 1rem;
      text-align: center;
      font-size: 0.8rem;
      color: var(--c-text-muted);
    }
    button {
      background: none;
      border: none;
      padding: 0;
      color: var(--c-primary);
      text-decoration: underline;
      cursor: pointer;
      font: inherit;
    }
  `],
})
export class FooterComponent {
  private swUpdate = inject(SwUpdate);
  readonly version = APP_VERSION;
  readonly updateAvailable = signal(false);

  constructor() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(evt => {
        if (evt.type === 'VERSION_READY') this.updateAvailable.set(true);
      });
      this.swUpdate.checkForUpdate();
    }
  }

  update() {
    this.swUpdate.activateUpdate().then(() => window.location.reload());
  }
}
