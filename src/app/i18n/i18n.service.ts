import { Injectable, signal } from '@angular/core';
import { Lang, LANGUAGES, LOCALE_TAG } from './i18n.types';
import { TRANSLATIONS } from './translations';

const LANG_KEY = 'metro_lang';
const SUPPORTED = new Set<Lang>(LANGUAGES.map((l) => l.code));

function detectLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && SUPPORTED.has(saved as Lang)) return saved as Lang;
  const system = (navigator.language ?? 'es').slice(0, 2).toLowerCase();
  return SUPPORTED.has(system as Lang) ? (system as Lang) : 'es';
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly languages = LANGUAGES;
  readonly lang = signal<Lang>(detectLang());

  constructor() {
    document.documentElement.lang = this.lang();
  }

  setLang(lang: Lang) {
    this.lang.set(lang);
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
  }

  get locale(): string {
    return LOCALE_TAG[this.lang()];
  }

  t = (key: string, params?: Record<string, string | number | null>): string => {
    const dict = TRANSLATIONS[this.lang()];
    let str = dict[key] ?? TRANSLATIONS.es[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) str = str.replaceAll(`{${k}}`, String(v));
    }
    return str;
  };

  /** Picks the `.one` / `.other` variant of `key` for count `n` (fine for the small counts used here — stops, transfers, meters). */
  tn(key: string, n: number, params?: Record<string, string | number | null>): string {
    return this.t(n === 1 ? `${key}.one` : `${key}.other`, { n, ...params });
  }
}
