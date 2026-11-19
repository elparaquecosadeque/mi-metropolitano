import { Component, inject } from '@angular/core';
import { InstallPromptService } from '../services/install-prompt.service';
import { I18nService } from '../i18n/i18n.service';

@Component({
  selector: 'app-install-page',
  standalone: true,
  template: `
    <div class="page">
      <h2>{{ i18n.t('install.title') }}</h2>
      <p class="hint">{{ i18n.t('install.hint') }}</p>

      <section class="platform">
        <h3>{{ i18n.t('install.androidTitle') }}</h3>
        @if (installPrompt.available()) {
          <button class="install-btn" (click)="installPrompt.promptInstall()">{{ i18n.t('install.androidBtn') }}</button>
        } @else {
          <ol>
            <li [innerHTML]="i18n.t('install.androidStep1')"></li>
            <li [innerHTML]="i18n.t('install.androidStep2')"></li>
            <li [innerHTML]="i18n.t('install.androidStep3')"></li>
          </ol>
        }
      </section>

      <section class="platform">
        <h3>{{ i18n.t('install.iosTitle') }}</h3>
        <ol>
          <li [innerHTML]="i18n.t('install.iosStep1')"></li>
          <li [innerHTML]="i18n.t('install.iosStep2')"></li>
          <li [innerHTML]="i18n.t('install.iosStep3')"></li>
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
  readonly i18n = inject(I18nService);
}
