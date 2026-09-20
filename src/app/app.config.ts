import {
  ApplicationConfig, ErrorHandler, provideAppInitializer, provideBrowserGlobalErrorListeners, inject, isDevMode,
} from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { TelemetryErrorHandler } from './telemetry/telemetry-error-handler';
import { TELEMETRY } from './telemetry/telemetry.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: TelemetryErrorHandler },
    provideAppInitializer(() => inject(TELEMETRY).start()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
