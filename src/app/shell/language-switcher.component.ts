import { Component, inject, signal } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { Lang } from '../i18n/i18n.types';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  template: `
    <div class="lang-switcher">
      <button class="lang-btn" (click)="open.set(!open())" [attr.aria-label]="i18n.t('header.langAria')" [attr.aria-expanded]="open()">
        {{ currentFlag() }}
      </button>

      @if (open()) {
        <div class="lang-backdrop" (click)="open.set(false)"></div>
        <ul class="lang-menu" role="listbox">
          @for (l of i18n.languages; track l.code) {
            <li
              role="option"
              [class.active]="l.code === i18n.lang()"
              (click)="choose(l.code)"
            >
              <span class="flag">{{ l.flag }}</span> {{ l.name }}
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .lang-switcher { position: relative; }
    .lang-btn {
      background: transparent;
      border: 1px solid var(--c-border);
      color: var(--c-text-muted);
      border-radius: 8px;
      padding: 0.3rem 0.5rem;
      font-size: 1rem;
      cursor: pointer;
      line-height: 1;
    }
    .lang-btn:hover { border-color: var(--c-primary); }
    .lang-backdrop { position: fixed; inset: 0; z-index: 10; }
    .lang-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 0.3rem;
      z-index: 20;
      list-style: none;
      padding: 0.25rem 0;
      margin: 0.3rem 0 0;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 10px;
      overflow: hidden;
      min-width: 9.5rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .lang-menu li {
      padding: 0.55rem 0.9rem;
      cursor: pointer;
      font-size: 0.9rem;
      color: var(--c-text);
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .lang-menu li:hover, .lang-menu li.active { background: var(--c-surface-2); }
    .flag { font-size: 1rem; }
  `],
})
export class LanguageSwitcherComponent {
  readonly i18n = inject(I18nService);
  readonly open = signal(false);

  currentFlag(): string {
    return this.i18n.languages.find((l) => l.code === this.i18n.lang())?.flag ?? '🌐';
  }

  choose(lang: Lang) {
    this.i18n.setLang(lang);
    this.open.set(false);
  }
}
