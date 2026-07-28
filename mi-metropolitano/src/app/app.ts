import { Component } from '@angular/core';
import { PlannerComponent } from './planner/planner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PlannerComponent],
  template: '<app-planner />',
})
export class App {}
