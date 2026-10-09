import { TelemetryDeps, TelemetryEvent, TelemetryService } from './telemetry.service';

const QUEUE = 'metro_telemetry_queue';

const res = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

type Responder = (url: string, init: RequestInit) => Response | Promise<Response>;
// Healthy server; `logs` decides what POST /logs answers.
const server = (logs: () => Response = () => res(200)): Responder => (url) =>
  url.endsWith('/health') ? res(200, { status: 'healthy' }) : logs();

function setup(respond: Responder = server(), over: Partial<TelemetryDeps> = {}) {
  const store = new Map<string, string>();
  const calls: { url: string; init: RequestInit }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let t = 1_700_000_000_000;
  let n = 0;
  const deps: TelemetryDeps = {
    baseUrl: 'https://m.test',
    key: 'k',
    app: 'mi-metropolitano',
    version: '1.2.3',
    env: 'prod',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return respond(url, init);
    },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    now: () => t,
    schedule: (fn, ms) => void timers.push({ fn, ms }),
    uuid: () => `id-${++n}`,
    context: () => ({
      url: '/?page=x', userAgent: 'ua', language: 'es', timezone: 'America/Lima',
      screen: '390x844', standalone: false, online: true,
    }),
    ...over,
  };
  return {
    svc: new TelemetryService(deps),
    store, calls, timers, deps,
    tick: (ms: number) => void (t += ms),
    queue: () => JSON.parse(store.get(QUEUE) ?? '[]') as TelemetryEvent[],
    posts: () => calls.filter((c) => c.url.endsWith('/logs')),
  };
}

describe('TelemetryService — capture', () => {
  it('builds an event with app, version, env, install id and device context', () => {
    const { svc, queue, store } = setup();
    svc.capture(new Error('boom'));
    const [ev] = queue();
    expect(ev).toMatchObject({
      type: 'error', app: 'mi-metropolitano', version: '1.2.3', env: 'prod',
      message: 'boom', count: 1, context: { userAgent: 'ua', screen: '390x844', standalone: false },
    });
    expect(ev.installId).toBe(store.get('metro_install_id'));
  });

  it('reuses the same install id across events', () => {
    const { svc, queue } = setup();
    svc.capture(new Error('a'));
    svc.capture(new Error('b'));
    const [a, b] = queue();
    expect(a.installId).toBe(b.installId);
  });

  it('folds a repeated error into one event with a count instead of a new row', () => {
    const { svc, queue } = setup();
    for (let i = 0; i < 3; i++) svc.capture(new Error('same'));
    svc.capture(new Error('other'));
    const q = queue();
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ message: 'same', count: 3 });
  });

  it('caps the queue at 50, dropping the oldest', () => {
    const { svc, queue } = setup();
    for (let i = 0; i < 60; i++) svc.capture(new Error(`e${i}`));
    const q = queue();
    expect(q).toHaveLength(50);
    expect(q[0].message).toBe('e10');
    expect(q[49].message).toBe('e59');
  });

  it('stops capturing after 100 automatic events in one session', () => {
    const { svc, queue } = setup();
    for (let i = 0; i < 105; i++) svc.capture(new Error(`e${i}`));
    expect(queue().at(-1)!.message).toBe('e99');
  });

  it('describes non-Error values and never throws on odd input', () => {
    const { svc, queue } = setup();
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => {
      svc.capture('plain string');
      svc.capture({ code: 7 });
      svc.capture(circular);
      svc.capture(undefined);
    }).not.toThrow();
    expect(queue().map((e) => e.message).slice(0, 2)).toEqual(['plain string', '{"code":7}']);
  });

  it('arms a single debounce timer so a burst is sent once', () => {
    const { svc, timers } = setup();
    svc.capture(new Error('a'));
    svc.capture(new Error('b'));
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(2000);
  });

  it('is a no-op when no server URL is configured', () => {
    const { svc, queue } = setup(server(), { baseUrl: '' });
    svc.capture(new Error('x'));
    expect(svc.enabled).toBe(false);
    expect(queue()).toEqual([]);
  });
});

describe('TelemetryService — open count', () => {
  it('sends one anonymous count as a simple text/plain POST, without ids or URL', () => {
    const { svc, calls } = setup();
    svc.countOpen();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://m.test/hit');
    expect(calls[0].init.headers).toEqual({ 'Content-Type': 'text/plain;charset=UTF-8' });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      key: 'k', app: 'mi-metropolitano', version: '1.2.3', env: 'prod', standalone: false,
    });
  });

  it('respects the opt-out switch and a missing server', () => {
    const off = setup();
    off.svc.setAutoCapture(false);
    off.svc.countOpen();
    expect(off.calls).toEqual([]);

    const none = setup(server(), { baseUrl: '' });
    none.svc.countOpen();
    expect(none.calls).toEqual([]);
  });

  it('never throws when the request fails', () => {
    const { svc } = setup(() => Promise.reject(new Error('offline')));
    expect(() => svc.countOpen()).not.toThrow();
  });
});

describe('TelemetryService — opt-out', () => {
  it('stops automatic capture and remembers the choice', () => {
    const { svc, queue, store, deps } = setup();
    svc.setAutoCapture(false);
    svc.capture(new Error('x'));
    expect(queue()).toEqual([]);
    expect(new TelemetryService(deps).autoCapture()).toBe(false);
    expect(store.get('metro_telemetry_off')).toBe('1');
  });

  it('discards queued automatic errors but keeps pending reports', async () => {
    const { svc, queue } = setup(() => res(503));
    await svc.report({ subject: 'Comentario', message: 'hola' });
    svc.capture(new Error('auto'));
    svc.setAutoCapture(false);
    expect(queue().map((e) => e.type)).toEqual(['report']);
  });
});

describe('TelemetryService — delivery', () => {
  it('checks /health, then POSTs a text/plain simple request with the public key, and empties the queue', async () => {
    const { svc, calls, queue } = setup();
    svc.capture(new Error('boom'));
    await svc.flush(true);

    expect(calls[0].url).toBe('https://m.test/health');
    expect(calls[0].init.cache).toBe('no-store');
    expect(calls[1].url).toBe('https://m.test/logs');
    expect(calls[1].init.method).toBe('POST');
    expect(calls[1].init.headers).toEqual({ 'Content-Type': 'text/plain;charset=UTF-8' });
    const body = JSON.parse(calls[1].init.body as string);
    expect(body.key).toBe('k');
    expect(body.events).toHaveLength(1);
    expect(queue()).toEqual([]);
  });

  it('does not send anything when /health is not healthy, and schedules a retry', async () => {
    const { svc, posts, queue, timers } = setup((url) => (url.endsWith('/health') ? res(200, { status: 'starting' }) : res(200)));
    svc.capture(new Error('boom'));
    timers[0].fn(); // the 2s debounce fires -> first attempt
    await svc.flush();
    expect(posts()).toHaveLength(0);
    expect(queue()).toHaveLength(1);
    expect(timers.at(-1)!.ms).toBe(30_000);
  });

  it.each([500, 503, 408, 429])('keeps the event when the server answers %i', async (status) => {
    const { svc, queue } = setup(server(() => res(status)));
    svc.capture(new Error('boom'));
    await svc.flush(true);
    expect(queue()).toHaveLength(1);
  });

  it.each([400, 401, 413])('drops the batch on a %i rejection so it cannot block the queue', async (status) => {
    const { svc, queue } = setup(server(() => res(status)));
    svc.capture(new Error('boom'));
    await svc.flush(true);
    expect(queue()).toEqual([]);
  });

  it('keeps the event on a network error', async () => {
    const { svc, queue } = setup(() => {
      throw new TypeError('Failed to fetch');
    });
    svc.capture(new Error('boom'));
    await expect(svc.flush(true)).resolves.toBeUndefined();
    expect(queue()).toHaveLength(1);
  });

  it('backs off 30s → 1m → 2m → 5m → 10m (capped) and resets after a success', async () => {
    let up = false;
    const { svc, timers, tick } = setup((url) => (url.endsWith('/health') ? res(up ? 200 : 503, { status: 'healthy' }) : res(200)));
    svc.capture(new Error('boom'));
    timers[0].fn(); // debounce fires -> first attempt fails
    await svc.flush();
    const delays = [timers.at(-1)!.ms];
    for (let i = 0; i < 5; i++) {
      tick(700_000);
      timers.at(-1)!.fn(); // backoff timer fires -> retry fails again
      await svc.flush();
      delays.push(timers.at(-1)!.ms);
    }
    expect(delays).toEqual([30_000, 60_000, 120_000, 300_000, 600_000, 600_000]);

    up = true;
    tick(700_000);
    timers.at(-1)!.fn();
    await svc.flush(); // success resets the ladder
    up = false;
    svc.capture(new Error('again'));
    timers.at(-1)!.fn();
    await svc.flush();
    expect(timers.at(-1)!.ms).toBe(30_000);
  });

  it('re-arms for the remainder when an early timer wakes inside a newer backoff window', async () => {
    const { svc, timers, tick } = setup(() => res(503));
    svc.capture(new Error('boom')); // arms the 2s debounce
    await svc.flush(true); // fails now: window is 30s, but the 2s timer is still the pending one
    tick(2000);
    timers[0].fn(); // wakes early
    expect(timers).toHaveLength(2);
    expect(timers[1].ms).toBe(28_000);
  });

  it('respects the backoff window unless forced', async () => {
    const { svc, calls, tick } = setup(() => res(503));
    svc.capture(new Error('boom'));
    await svc.flush(true);
    const after = calls.length;

    await svc.flush(); // inside the 30s window
    expect(calls).toHaveLength(after);

    await svc.flush(true); // user action / connectivity back
    expect(calls.length).toBeGreaterThan(after);

    tick(10 * 60_000);
    const before = calls.length;
    await svc.flush(); // window elapsed
    expect(calls.length).toBeGreaterThan(before);
  });

  it('never runs two flushes at once', async () => {
    const { svc, calls } = setup();
    svc.capture(new Error('boom'));
    await Promise.all([svc.flush(true), svc.flush(true)]);
    expect(calls.filter((c) => c.url.endsWith('/health'))).toHaveLength(1);
  });

  it('splits a large queue into several POSTs, each under 16KB', async () => {
    const { svc, posts, queue } = setup();
    for (let i = 0; i < 30; i++) {
      const e = new Error(`m${i}`);
      e.stack = 'x'.repeat(3000);
      svc.capture(e);
    }
    await svc.flush(true);
    expect(posts().length).toBeGreaterThan(1);
    posts().forEach((p) => expect((p.init.body as string).length).toBeLessThan(16 * 1024));
    const sent = posts().reduce((n, p) => n + JSON.parse(p.init.body as string).events.length, 0);
    expect(sent).toBe(30);
    expect(queue()).toEqual([]);
  });

  it('keeps working (and never re-sends) when localStorage is unavailable', async () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const { svc, posts } = setup(server(), { storage: broken });
    expect(() => svc.capture(new Error('boom'))).not.toThrow();
    await svc.flush(true);
    await svc.flush(true);
    expect(posts()).toHaveLength(1);
  });
});

describe('TelemetryService — manual reports', () => {
  it("returns 'sent' when the server accepts it", async () => {
    const { svc, posts } = setup();
    const r = await svc.report({ subject: 'Sugerencia', message: 'hola', replyTo: 'a@b.co' });
    expect(r).toBe('sent');
    const ev = JSON.parse(posts()[0].init.body as string).events[0];
    expect(ev).toMatchObject({ type: 'report', message: 'hola', report: { subject: 'Sugerencia', replyTo: 'a@b.co' } });
  });

  it("returns 'queued' (not 'sent') when the server is down", async () => {
    const { svc, queue } = setup(() => res(503));
    expect(await svc.report({ subject: 'Comentario', message: 'hola' })).toBe('queued');
    expect(queue()).toHaveLength(1);
  });

  it("returns 'failed' when the server rejects it", async () => {
    const { svc } = setup(server(() => res(403)));
    expect(await svc.report({ subject: 'Comentario', message: 'hola' })).toBe('failed');
  });

  it("returns 'disabled' when telemetry has no server, so the form can fall back to mailto", async () => {
    const { svc } = setup(server(), { baseUrl: '' });
    expect(await svc.report({ subject: 'Comentario', message: 'hola' })).toBe('disabled');
  });

  it('is sent even when automatic capture is switched off', async () => {
    const { svc } = setup();
    svc.setAutoCapture(false);
    expect(await svc.report({ subject: 'Comentario', message: 'hola' })).toBe('sent');
  });
});
