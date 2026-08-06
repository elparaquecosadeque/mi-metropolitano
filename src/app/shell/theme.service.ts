import { Injectable, signal, inject, DOCUMENT } from '@angular/core';

const THEME_KEY = 'metro_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private doc = inject(DOCUMENT);
  readonly isLight = signal(localStorage.getItem(THEME_KEY) === 'light');

  constructor() {
    if (this.isLight()) this.doc.body.classList.add('light');
  }

  toggle() {
    const next = !this.isLight();
    this.isLight.set(next);
    this.doc.body.classList.toggle('light', next);
    localStorage.setItem(THEME_KEY, next ? 'light' : 'dark');
  }
}
