import { InjectionToken, isDevMode, signal } from '@angular/core';
import { APP_VERSION } from '../version';

/** Public URL of the metrics server (Cloudflare Tunnel). Empty = telemetry is inactive (no-op). */
export const TELEMETRY_BASE_URL = 'https://metrics.gerardoleon.dev';
/** Public, NOT secret: it only filters casual noise. Real limits live server-side (docs/telemetry-contract.md). */
const TELEMETRY_KEY = 'metroapp-public';

const QUEUE_KEY = 'metro_telemetry_queue';
const INSTALL_ID_KEY = 'metro_install_id';
const OFF_KEY = 'metro_telemetry_off';

const MAX_QUEUE = 50;
const SESSION_CAP = 100; // automatic captures per page load — hard stop against error storms
const DEBOUNCE_MS = 2000; // lets a burst of identical errors fold into one event before sending
const BATCH_CHARS = 12_000; // keeps every POST comfortably under the 16KB the contract advises
const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];
const HEALTH_TIMEOUT_MS = 3000;
const POST_TIMEOUT_MS = 10_000;

export interface EventContext {
  url: string;
  userAgent: string;
  language: string;
  timezone: string;
  screen: string;
  standalone: boolean;
  online: boolean;
}

export interface TelemetryEvent {
  id: string;
  type: 'error' | 'report';
  app: string;
  version: string;
  env: 'dev' | 'prod';
  installId: string;
  ts: string;
  lastSeen: string;
  count: number;
  message: string;
  stack?: string;
  fingerprint?: string;
  report?: { subject: string; replyTo?: string };
  context: EventContext;
}

export interface TelemetryDeps {
  baseUrl: string;
  key: string;
  app: string;
  version: string;
  env: 'dev' | 'prod';
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now: () => number;
  schedule: (fn: () => void, ms: number) => void;
  uuid: () => string;
  context: () => EventContext;
}

export type ReportResult = 'sent' | 'queued' | 'failed' | 'disabled';

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

function describe(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message || err.name, stack: err.stack };
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) ?? String(err) };
  } catch {
    return { message: String(err) };
  }
}

// djb2 — only used to group repeats of the same error (server-side too), not for security.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

const timeout = (ms: number) =>
  typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined;

/**
 * Error/report pipeline: capture -> persistent queue (localStorage) -> health check -> batched POST.
 * Nothing here may throw to the caller or recurse into the ErrorHandler.
 * ponytail: retries only happen while the app is open (no Background Sync on iOS/Firefox).
 */
export class TelemetryService {
  readonly enabled: boolean;
  /** Automatic error capture on/off (toggle in "Nosotros"). Manual reports ignore it. */
  readonly autoCapture = signal(true);

  private step = 0;
  private nextAttemptAt = 0;
  private timerPending = false;
  private flushing?: Promise<void>;
  private captured = 0;
  private installId?: string;
  // Ids already accepted ('ok') or rejected ('drop') this session — guarantees a batch is never
  // re-sent (or looped on) even if localStorage is unavailable and can't remove it.
  private readonly done = new Map<string, 'ok' | 'drop'>();
  // Fallback copy of the queue for when localStorage is unavailable/full.
  private mem: TelemetryEvent[] = [];
  private broken = false;

  constructor(private readonly deps: TelemetryDeps) {
    this.enabled = !!deps.baseUrl;
    this.autoCapture.set(this.read(OFF_KEY) !== '1');
  }

  /** Hooks the triggers that drain the queue. Called once at app start. */
  start(): void {
    if (!this.enabled || typeof window === 'undefined') return;
    window.addEventListener('online', () => void this.flush(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.flush();
    });
    void this.flush();
    this.countOpen();
  }

  /**
   * One anonymous count per app open, for the traffic panels: no install id, no URL, no queue.
   * Follows the same switch as automatic errors. Fire-and-forget: lost if the server is down.
   */
  countOpen(): void {
    if (!this.enabled || !this.autoCapture()) return;
    try {
      const { app, version, env, key } = this.deps;
      void this.deps
        .fetch(`${this.deps.baseUrl}/hit`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, // CORS simple request, like /logs
          body: JSON.stringify({ key, app, version, env, standalone: this.deps.context().standalone }),
          keepalive: true,
        })
        .catch(() => {});
    } catch {
      /* telemetry must never break the app */
    }
  }

  /** Automatic capture (ErrorHandler). Never throws. */
  capture(error: unknown): void {
    try {
      if (!this.enabled || !this.autoCapture() || this.captured >= SESSION_CAP) return;
      this.captured++;
      const { message, stack } = describe(error);
      const fingerprint = hash(message + '\n' + (stack ?? '').split('\n').slice(0, 3).join('\n'));
      const queue = this.load();
      // ponytail: a repeat that lands while its first copy is mid-flight is folded then lost from the count
      const dup = queue.find((e) => e.type === 'error' && e.fingerprint === fingerprint && !this.done.has(e.id));
      if (dup) {
        dup.count++;
        dup.lastSeen = this.iso();
        this.write(queue);
      } else {
        const ev = this.build('error', cut(message, 500), stack && cut(stack, 1500));
        ev.fingerprint = fingerprint;
        this.write([...queue, ev].slice(-MAX_QUEUE));
      }
      this.arm(DEBOUNCE_MS);
    } catch {
      /* telemetry must never break the app */
    }
  }

  /** Manual report (Contact form). Resolves once delivered, or once it's safely queued. */
  async report(r: { subject: string; message: string; replyTo?: string }): Promise<ReportResult> {
    if (!this.enabled) return 'disabled';
    try {
      const ev = this.build('report', cut(r.message, 2000));
      ev.report = { subject: cut(r.subject, 100), ...(r.replyTo ? { replyTo: cut(r.replyTo, 200) } : {}) };
      this.write([...this.load(), ev].slice(-MAX_QUEUE));
      await this.flush(true);
      const outcome = this.done.get(ev.id);
      return outcome === 'ok' ? 'sent' : outcome === 'drop' ? 'failed' : 'queued';
    } catch {
      return 'failed';
    }
  }

  setAutoCapture(on: boolean): void {
    this.autoCapture.set(on);
    try {
      this.deps.storage.setItem(OFF_KEY, on ? '0' : '1');
    } catch {
      /* preference lasts this session only */
    }
    // Opting out also discards automatic errors still waiting to be sent; reports stay.
    if (!on) this.write(this.load().filter((e) => e.type === 'report'));
  }

  /** Try to drain the queue. `force` skips the backoff window (user action / connectivity back). */
  flush(force = false): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    if (this.flushing) return this.flushing;
    if (!force && this.deps.now() < this.nextAttemptAt) return Promise.resolve();
    this.flushing = this.run().finally(() => (this.flushing = undefined));
    return this.flushing;
  }

  private async run(): Promise<void> {
    try {
      if (!this.pending().length) return;
      if (!(await this.healthy())) return this.fail();
      for (let batch = this.nextBatch(); batch.length; batch = this.nextBatch()) {
        const outcome = await this.post(batch);
        if (outcome === 'retry') return this.fail();
        const ids = new Set(batch.map((e) => e.id));
        batch.forEach((e) => this.done.set(e.id, outcome));
        this.write(this.load().filter((e) => !ids.has(e.id)));
        this.step = 0;
        this.nextAttemptAt = 0;
      }
    } catch {
      this.fail();
    }
  }

  private async healthy(): Promise<boolean> {
    try {
      const res = await this.deps.fetch(`${this.deps.baseUrl}/health`, {
        cache: 'no-store',
        signal: timeout(HEALTH_TIMEOUT_MS),
      });
      return res.ok && (await res.json())?.status === 'healthy';
    } catch {
      return false;
    }
  }

  private async post(batch: TelemetryEvent[]): Promise<'ok' | 'drop' | 'retry'> {
    try {
      const res = await this.deps.fetch(`${this.deps.baseUrl}/logs`, {
        method: 'POST',
        // text/plain keeps this a CORS "simple request": no preflight, and sendBeacon-compatible
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ key: this.deps.key, events: batch }),
        signal: timeout(POST_TIMEOUT_MS),
      });
      if (res.ok) return 'ok';
      // Transient -> keep and retry. Any other 4xx means the server rejected it: drop, or one bad event blocks the queue forever.
      return res.status === 408 || res.status === 429 || res.status >= 500 ? 'retry' : 'drop';
    } catch {
      return 'retry';
    }
  }

  private fail(): void {
    const delay = BACKOFF_MS[Math.min(this.step, BACKOFF_MS.length - 1)];
    this.step++;
    this.nextAttemptAt = this.deps.now() + delay;
    this.arm(delay);
  }

  private arm(ms: number): void {
    if (this.timerPending) return;
    this.timerPending = true;
    this.deps.schedule(() => {
      this.timerPending = false;
      const wait = this.nextAttemptAt - this.deps.now();
      if (wait > 0) this.arm(wait); // woke up early (a newer failure pushed the window out)
      else void this.flush();
    }, ms);
  }

  private pending(): TelemetryEvent[] {
    return this.load().filter((e) => !this.done.has(e.id));
  }

  private nextBatch(): TelemetryEvent[] {
    const batch: TelemetryEvent[] = [];
    let size = 0;
    for (const e of this.pending()) {
      const n = JSON.stringify(e).length;
      if (batch.length && size + n > BATCH_CHARS) break;
      batch.push(e);
      size += n;
    }
    return batch;
  }

  private build(type: 'error' | 'report', message: string, stack?: string): TelemetryEvent {
    const now = this.iso();
    return {
      id: this.deps.uuid(),
      type,
      app: this.deps.app,
      version: this.deps.version,
      env: this.deps.env,
      installId: this.id(),
      ts: now,
      lastSeen: now,
      count: 1,
      message,
      ...(stack ? { stack } : {}),
      context: this.deps.context(),
    };
  }

  private iso(): string {
    return new Date(this.deps.now()).toISOString();
  }

  private id(): string {
    if (this.installId) return this.installId;
    let v = this.read(INSTALL_ID_KEY);
    if (!v) {
      v = this.deps.uuid();
      try {
        this.deps.storage.setItem(INSTALL_ID_KEY, v);
      } catch {
        /* id lasts this session only */
      }
    }
    return (this.installId = v);
  }

  private read(key: string): string | null {
    try {
      return this.deps.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private load(): TelemetryEvent[] {
    if (this.broken) return this.mem;
    try {
      const v = JSON.parse(this.deps.storage.getItem(QUEUE_KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      this.broken = true;
      return this.mem;
    }
  }

  private write(queue: TelemetryEvent[]): void {
    this.mem = queue;
    try {
      this.deps.storage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // Likely full: keep only the newest few before giving up on persistence.
      try {
        this.deps.storage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-10)));
      } catch {
        this.broken = true;
      }
    }
  }
}

function browserDeps(): TelemetryDeps {
  return {
    baseUrl: TELEMETRY_BASE_URL,
    key: TELEMETRY_KEY,
    app: 'mi-metropolitano',
    version: APP_VERSION,
    env: isDevMode() ? 'dev' : 'prod',
    fetch: (url, init) => fetch(url, init),
    storage: { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) },
    now: () => Date.now(),
    schedule: (fn, ms) => void setTimeout(fn, ms),
    uuid: () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    context: () => ({
      url: location.pathname + location.search,
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
      standalone:
        matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
      online: navigator.onLine,
    }),
  };
}

export const TELEMETRY = new InjectionToken<TelemetryService>('TELEMETRY', {
  providedIn: 'root',
  factory: () => new TelemetryService(browserDeps()),
});
