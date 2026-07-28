import { Injectable } from '@angular/core';
import { DayGroup, Route, Schedule } from '../models/route.model';

/** Minutes before a window closes/opens to show an indicator. */
const THRESHOLD_MINUTES = 30;

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  /** True if any schedule window covers the given Date (Lima time). */
  isAvailable(route: Route, now: Date): boolean {
    return route.schedules.some((s) => this.windowActive(s, now));
  }

  /**
   * Minutes until the route stops service (current window closes).
   * Returns null if not currently available.
   * Returns the value only when it's ≤ THRESHOLD_MINUTES (i.e. "ending soon").
   */
  minutesToClose(route: Route, now: Date): number | null {
    for (const s of route.schedules) {
      if (!this.windowActive(s, now)) continue;
      const mins = this.minutesUntilTime(s.end, now);
      return mins <= THRESHOLD_MINUTES ? mins : null;
    }
    return null;
  }

  /**
   * Minutes until the route next becomes available.
   * Returns null if already available.
   * Returns the value only when it's ≤ THRESHOLD_MINUTES (i.e. "starting soon").
   */
  minutesToOpen(route: Route, now: Date): number | null {
    if (this.isAvailable(route, now)) return null;
    let min = Infinity;
    for (const s of route.schedules) {
      if (!this.dayMatches(s.days, now)) continue;
      const mins = this.minutesUntilTime(s.start, now);
      if (mins >= 0 && mins < min) min = mins;
    }
    return min <= THRESHOLD_MINUTES ? min : null;
  }

  private windowActive(s: Schedule, now: Date): boolean {
    if (!this.dayMatches(s.days, now)) return false;
    const currentMin = this.minutesSinceMidnight(now);
    const startMin = this.parseHHMM(s.start);
    const endMin = this.parseHHMM(s.end);

    if (endMin > startMin) {
      // Normal window (e.g. 05:00–23:00)
      return currentMin >= startMin && currentMin < endMin;
    } else {
      // Spans midnight (e.g. 23:30–04:00)
      return currentMin >= startMin || currentMin < endMin;
    }
  }

  private dayMatches(days: DayGroup[], now: Date): boolean {
    const dow = now.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
    return days.some((d) => {
      switch (d) {
        case 'lv':            return dow >= 1 && dow <= 5;
        case 'lunes-sabado':  return dow >= 1 && dow <= 6;
        case 'sabado':        return dow === 6;
        case 'domingo':       return dow === 0;
        case 'viernesSabado': return dow === 5 || dow === 6;
      }
    });
  }

  private minutesSinceMidnight(d: Date): number {
    return d.getHours() * 60 + d.getMinutes();
  }

  private parseHHMM(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private minutesUntilTime(hhmm: string, now: Date): number {
    const target = this.parseHHMM(hhmm);
    const current = this.minutesSinceMidnight(now);
    let diff = target - current;
    if (diff < 0) diff += 24 * 60; // wrap to next occurrence
    return diff;
  }
}
