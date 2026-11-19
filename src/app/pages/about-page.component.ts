import { Component, inject } from '@angular/core';
import { TELEMETRY } from '../telemetry/telemetry.service';
import { I18nService } from '../i18n/i18n.service';

const REPO_URL = 'https://github.com/elparaquecosadeque/mi-metropolitano';

@Component({
  selector: 'app-about-page',
  standalone: true,
  template: `
    <div class="page">
      <h2>{{ i18n.t('about.title') }}</h2>
      <p [innerHTML]="i18n.t('about.intro1')"></p>
      <p>{{ i18n.t('about.intro2') }}</p>
      <a class="repo-link" [href]="repoUrl" target="_blank" rel="noopener">{{ i18n.t('about.repoLink') }}</a>

      @if (telemetry.enabled) {
        <section class="privacy">
          <h3>{{ i18n.t('about.privacyTitle') }}</h3>
          <p>{{ i18n.t('about.privacyP1') }}</p>
          <p>{{ i18n.t('about.privacyP2') }}</p>
          <p>{{ i18n.t('about.privacyP3') }}</p>
          <label class="toggle">
            <input
              type="checkbox"
              [checked]="telemetry.autoCapture()"
              (change)="telemetry.setAutoCapture($any($event.target).checked)"
            />
            {{ i18n.t('about.toggleLabel') }}
          </label>
          <p class="note">{{ i18n.t('about.note') }}</p>
        </section>
      }

      <!-- ponytail: sección de donaciones (Yape/otro) pendiente — el autor aún no decide
           qué plataforma usar sin exponer datos personales. Agregar como bloque aparte
           al final de esta página cuando esté decidido. -->
    </div>
  `,
  styles: [`
    .page { max-width: 600px; margin: 0 auto; padding: 0 1rem 1rem; }
    h2 { color: var(--c-primary); }
    p { line-height: 1.5; }
    .repo-link {
      display: inline-block;
      margin-top: 0.5rem;
      color: var(--c-primary);
      font-weight: bold;
      text-decoration: none;
    }
    .repo-link:hover { text-decoration: underline; }
    .privacy { margin-top: 1.5rem; padding-top: 0.5rem; border-top: 1px solid var(--c-border); }
    h3 { color: var(--c-primary); font-size: 1.05rem; }
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-top: 1rem;
      cursor: pointer;
    }
    .toggle input { width: 1.1rem; height: 1.1rem; accent-color: var(--c-primary); cursor: pointer; }
    .note { color: var(--c-text-muted); font-size: 0.85rem; margin-top: 0.4rem; }
  `],
})
export class AboutPageComponent {
  readonly repoUrl = REPO_URL;
  readonly telemetry = inject(TELEMETRY);
  readonly i18n = inject(I18nService);
}
