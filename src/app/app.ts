import { Component } from '@angular/core';
import { PlannerComponent } from './planner/planner.component';
import { AdminComponent } from './admin/admin.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PlannerComponent, AdminComponent],
  // ponytail: no router — ?admin param checked at runtime
  template: `@if (isAdmin) { <app-admin /> } @else { <app-planner /> }`,
})
export class App {
  readonly isAdmin = new URLSearchParams(window.location.search).has('admin');
}
