import { ErrorHandler, Injectable, inject } from '@angular/core';
import { TELEMETRY } from './telemetry.service';

/** Keeps Angular's default behaviour (console.error) and also reports the error to metroapp's server. */
@Injectable()
export class TelemetryErrorHandler implements ErrorHandler {
  private readonly telemetry = inject(TELEMETRY);

  handleError(error: unknown): void {
    console.error(error);
    this.telemetry.capture(error); // never throws
  }
}
