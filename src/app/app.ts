import { Component, inject } from '@angular/core';
import { PlannerComponent } from './planner/planner.component';
import { AdminComponent } from './admin/admin.component';
import { HeaderComponent } from './shell/header.component';
import { FooterComponent } from './shell/footer.component';
import { RoutesPageComponent } from './pages/routes-page.component';
import { ContactPageComponent } from './pages/contact-page.component';
import { AboutPageComponent } from './pages/about-page.component';
import { InstallPageComponent } from './pages/install-page.component';
import { InstallPromptService } from './services/install-prompt.service';

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

  private readonly params = new URLSearchParams(window.location.search);
  readonly isAdmin = this.params.has('admin');
  readonly page = this.params.get('page');
}
