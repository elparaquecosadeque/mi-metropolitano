import { TestBed } from '@angular/core/testing';
import { StationPickerComponent } from './station-picker.component';
import { Station } from '../models/route.model';

const STATIONS: Station[] = [
  { id: 'estadio-union', name: 'Estadio Unión' },
  { id: 'teran', name: 'Estación Terán' },
  { id: 'naranjal', name: 'Naranjal' },
];

function makePicker() {
  const fixture = TestBed.createComponent(StationPickerComponent);
  fixture.componentRef.setInput('stations', STATIONS);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('StationPickerComponent — accent-insensitive search', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [StationPickerComponent] }));

  it('matches a station with a tilde when the query has none ("unio" -> "Unión")', () => {
    const picker = makePicker();
    picker.onInput('estadio unio');
    expect(picker.filtered().map(s => s.id)).toEqual(['estadio-union']);
  });

  it('matches "teran" against "Terán"', () => {
    const picker = makePicker();
    picker.onInput('teran');
    expect(picker.filtered().map(s => s.id)).toEqual(['teran']);
  });

  it('still matches when the query itself has the tilde', () => {
    const picker = makePicker();
    picker.onInput('unión');
    expect(picker.filtered().map(s => s.id)).toEqual(['estadio-union']);
  });

  it('stays case-insensitive', () => {
    const picker = makePicker();
    picker.onInput('NARANJAL');
    expect(picker.filtered().map(s => s.id)).toEqual(['naranjal']);
  });

  it('returns everything for an empty query', () => {
    const picker = makePicker();
    picker.onInput('');
    expect(picker.filtered()).toHaveLength(STATIONS.length);
  });
});
