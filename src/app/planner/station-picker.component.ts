import {
  Component, input, output, signal, computed, effect, viewChild, ElementRef,
} from '@angular/core';
import { Station } from '../models/route.model';

@Component({
  selector: 'app-station-picker',
  standalone: true,
  template: `
    <div class="picker">
      <label>{{ label() }}</label>
      <div class="picker-wrap">
        <input
          #inputRef
          type="text"
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          placeholder="— busca estación —"
          [value]="inputValue()"
          (focus)="onFocus()"
          (input)="onInput($any($event.target).value)"
          (blur)="onBlur()"
        />
        @if (selectedId()) {
          <button class="picker-clear" (mousedown)="$event.preventDefault(); clear()" title="Limpiar">✕</button>
        }
      </div>
      @if (showList()) {
        <ul class="suggestions" role="listbox">
          @for (s of filtered(); track s.id) {
            <li
              role="option"
              [class.active]="s.id === selectedId()"
              (mousedown)="$event.preventDefault(); select(s)"
            >{{ s.name }}</li>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    .picker { position: relative; margin-bottom: 0.75rem; }
    label {
      display: block;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--c-text-muted);
      margin-bottom: 0.3rem;
    }
    .picker-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    input {
      width: 100%;
      background: var(--c-surface-2);
      color: var(--c-text);
      border: 1px solid var(--c-primary);
      border-radius: 8px;
      padding: 0.6rem 2.2rem 0.6rem 0.8rem;
      font-size: 1rem;
      box-sizing: border-box;
      &:focus { outline: 2px solid var(--c-primary); }
      &::placeholder { color: var(--c-text-muted); }
    }
    .picker-clear {
      position: absolute;
      right: 0.5rem;
      background: transparent;
      border: none;
      color: var(--c-text-muted);
      font-size: 0.85rem;
      cursor: pointer;
      line-height: 1;
      padding: 0.25rem;
      &:hover { color: var(--c-text); }
    }
    .suggestions {
      position: absolute;
      z-index: 100;
      top: calc(100% + 2px);
      left: 0; right: 0;
      background: var(--c-surface);
      border: 1px solid var(--c-primary);
      border-radius: 8px;
      margin: 0;
      padding: 0.25rem 0;
      list-style: none;
      max-height: 220px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      li {
        padding: 0.55rem 0.9rem;
        cursor: pointer;
        font-size: 0.95rem;
        color: var(--c-text);
        &:hover, &.active { background: var(--c-primary); color: #fff; }
      }
    }
  `],
})
export class StationPickerComponent {
  label      = input<string>('');
  stations   = input<Station[]>([]);
  selectedId = input<string>('');
  stationChange = output<string>();

  inputValue = signal('');
  showList   = signal(false);
  inputRef   = viewChild<ElementRef<HTMLInputElement>>('inputRef');

  private selectedName = computed(() =>
    this.stations().find(s => s.id === this.selectedId())?.name ?? ''
  );

  filtered = computed(() => {
    const q = this.inputValue().toLowerCase();
    if (!q) return this.stations();
    return this.stations().filter(s => s.name.toLowerCase().includes(q));
  });

  constructor() {
    // Sync inputValue when selectedId changes externally (e.g. favorite applied, URL param)
    effect(() => {
      if (!this.showList()) this.inputValue.set(this.selectedName());
    });
  }

  onFocus() {
    this.inputValue.set('');
    this.showList.set(true);
  }

  onInput(val: string) {
    this.inputValue.set(val);
  }

  onBlur() {
    setTimeout(() => {
      this.inputValue.set(this.selectedName());
      this.showList.set(false);
    }, 150);
  }

  select(station: Station) {
    this.stationChange.emit(station.id);
    this.inputValue.set(station.name);
    this.showList.set(false);
  }

  clear() {
    this.stationChange.emit('');
    this.inputValue.set('');
  }
}
