import { Component, effect, inject } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { PlannerComponent } from './planner/planner.component';
import { AdminComponent } from './admin/admin.component';
import { HeaderComponent } from './shell/header.component';
import { FooterComponent } from './shell/footer.component';
import { RoutesPageComponent } from './pages/routes-page.component';
import { ContactPageComponent } from './pages/contact-page.component';
import { AboutPageComponent } from './pages/about-page.component';
import { InstallPageComponent } from './pages/install-page.component';
import { InstallPromptService } from './services/install-prompt.service';
import { isStagingHost } from './telemetry/telemetry.service';
import { I18nService } from './i18n/i18n.service';

const PAGE_TITLE_KEY: Record<string, string> = {
  rutas: 'page.routes',
  contacto: 'page.contact',
  nosotros: 'page.about',
  instalar: 'page.install',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    PlannerComponent, AdminComponent, HeaderComponent, FooterComponent,
    RoutesPageComponent, ContactPageComponent, AboutPageComponent, InstallPageComponent,
  ],
  // ponytail: no router — ?admin and ?page params checked at runtime
  template: `
    @if (isAdmin) {
      <app-admin />
    } @else {
      <app-header />
      @switch (page) {
        @case ('rutas') { <app-routes-page /> }
        @case ('contacto') { <app-contact-page /> }
        @case ('nosotros') { <app-about-page /> }
        @case ('instalar') { <app-install-page /> }
        @default { <app-planner /> }
      }
      <app-footer />
    }
  `,
})
export class App {
  // injected eagerly (unused directly) so the beforeinstallprompt listener
  // attaches from app startup, not only once the install page is opened
  private readonly installPrompt = inject(InstallPromptService);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly i18n = inject(I18nService);

  private readonly params = new URLSearchParams(window.location.search);
  readonly isAdmin = this.params.has('admin');
  readonly page = this.params.get('page');

  constructor() {
    const titleKey = this.page && PAGE_TITLE_KEY[this.page];
    if (titleKey) {
      effect(() => this.titleService.setTitle(`${this.i18n.t(titleKey)} | Mi Metropolitano`));
    }

    // Same build serves staging and prod — the host is the only thing telling them apart
    // (see isStagingHost in telemetry.service.ts). Keep the stage domain out of search results.
    if (isStagingHost(window.location.hostname)) {
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    }
  }
}
