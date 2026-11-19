import { Component, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { APP_VERSION } from '../version';
import { I18nService } from '../i18n/i18n.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  template: `
    <footer>
      {{ i18n.t('footer.version', { v: version }) }}
      @if (updateAvailable()) {
        {{ i18n.t('footer.newVersion') }}
        <button (click)="update()">{{ i18n.t('footer.updateHere') }}</button>
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
  readonly i18n = inject(I18nService);
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
