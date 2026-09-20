# Contrato de telemetría de metroapp (v1)

> **Para quien implemente el receptor** (persona o sesión de Claude que no tiene el contexto de la
> conversación donde se diseñó esto): este documento es autocontenido. Define el **qué** —endpoints,
> payload, códigos de respuesta, CORS— y deja abierto el **cómo** (lenguaje, almacenamiento,
> dashboards). Si este documento y el código del cliente difieren, **gana el código**:
> `src/app/telemetry/telemetry.service.ts` (tipos `TelemetryEvent` / `EventContext`).

## 1. Contexto

- **Qué es metroapp:** "Mi Metropolitano", una PWA ciudadana (Angular) que dice qué bus del
  Metropolitano de Lima tomar. Estática, sin backend propio. Vive en
  `https://oficinamentaldebruno.com/mi-metropolitano/` (GitHub Pages). Repo:
  `github.com/elparaquecosadeque/mi-metropolitano`.
- **Qué manda:** (a) errores no capturados del app (automáticos) y (b) mensajes del formulario
  de Contacto/Reporte (los escribe una persona).
- **A dónde:** `https://metrics.gerardoleon.dev` — un servidor **propio** en una laptop de casa
  (Docker + Cloudflare Tunnel) que **a veces está apagado**. Por eso el cliente guarda los
  eventos en el dispositivo y reintenta (ver §3). El receptor debe asumir que los eventos pueden
  llegar **horas o días tarde** y en orden distinto al que ocurrieron.
- **Qué se quiere ver al final:** Grafana con un dashboard de seguimiento de issues (qué errores
  hay, cuáles son más frecuentes, en qué versión, reportes de usuarios). Grafana **no recibe
  POSTs**: necesita un almacenamiento detrás del receptor (ver §9).
- **Volumen esperado:** pequeño (una app de barrio). Una instalación sana no envía nada; una rota
  envía unos pocos eventos por minuto como máximo (el cliente agrupa y limita, ver §3).

## 2. Resumen del contrato

| Endpoint       | Método | Para qué                                              |
| -------------- | ------ | ----------------------------------------------------- |
| `/health`      | GET    | El cliente lo consulta antes de enviar. Debe decir `healthy`. |
| `/logs`        | POST   | Recibe un lote de eventos.                            |

Base URL en el cliente: constante `TELEMETRY_BASE_URL` (`telemetry.service.ts`). Si queda vacía, la
telemetría está inactiva y el formulario de Contacto vuelve a abrir el `mailto:`.

## 3. Cómo se comporta el cliente (lo que el receptor debe saber)

1. Un error o reporte se guarda en una **cola en el dispositivo** (`localStorage`, máx. **50**
   eventos; al llenarse se descarta el más antiguo).
2. Errores repetidos (mismo mensaje + primeras 3 líneas del stack) **se funden en un solo evento
   con `count`** mientras esperan en la cola. Tope duro: 100 capturas automáticas por carga de
   página.
3. Poco después de capturar (debounce 2 s) hace `GET /health`. **Solo si responde `healthy`**
   envía la cola con `POST /logs`, en lotes de < ~12 KB (mín. 1 evento por lote).
4. Si algo falla reintenta con backoff: **30 s → 1 min → 2 min → 5 min → 10 min (tope)**; se
   reinicia al primer éxito. También intenta al abrir el app, al volver la conexión (`online`) y al
   volver a la pestaña.
5. Timeouts: `/health` 3 s, `/logs` 10 s.

**Límite conocido:** los reintentos solo ocurren con el app **abierto** en ese dispositivo (no hay
Background Sync en iOS ni Firefox). Un reporte guardado en un teléfono cuyo dueño cierra el app no
llega hasta que la vuelva a abrir.

## 4. `GET /health`

- Responder **HTTP 200** con JSON exactamente `{"status":"healthy"}`.
- Cualquier otra cosa cuenta como "servidor no disponible": otro status HTTP, otro valor de
  `status`, cuerpo que no sea JSON, o tardar más de 3 s. (Por eso, si el receptor está vivo pero su
  base de datos no, **responde 503**: así el cliente no le manda datos que no podrá guardar.)
- El cliente **lee** la respuesta ⇒ necesita cabeceras CORS (§7).
- Se llama con `cache: 'no-store'`, sin cabeceras personalizadas (no dispara preflight).

## 5. `POST /logs`

- `Content-Type: text/plain;charset=UTF-8`. Es a propósito: convierte el POST en un request CORS
  **"simple" (sin preflight `OPTIONS`)** y es compatible con `sendBeacon`. **El cuerpo es JSON
  igualmente** ⇒ el receptor debe **parsear el body de `text/plain` como JSON** (Express:
  `express.text({type:'*/*'})` + `JSON.parse`; Fastify: `addContentTypeParser('text/plain', {parseAs:'string'}, …)`).
- Cuerpo:

```json
{
  "key": "metroapp-public",
  "events": [ { "…": "ver esquema §6" } ]
}
```

- `key` es una **clave pública** fija (`TELEMETRY_KEY` en el cliente). **No es un secreto**: va en el
  JS del app; solo filtra ruido casual. La protección real es rate limit + validación (§8).
  Va en el body (no en una cabecera) para no provocar preflight.
- Cada lote pesa < 16 KB (el cliente parte la cola en varios POST si hace falta). Un solo evento
  cabe siempre holgado.

### Respuestas y qué hace el cliente con cada una

| Respuesta                                          | El cliente…                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| **2xx**                                            | Da **todo el lote** por entregado y lo borra de su cola.          |
| **408**, **429**, **5xx**, timeout (10 s), red     | Conserva el lote y **reintenta** con backoff.                     |
| **Cualquier otro 4xx** (400, 401, 403, 413, …)     | **Descarta el lote entero** (si no, un lote rechazado bloquearía la cola para siempre). |

Consecuencias para el receptor:

- **No existe aceptación parcial.** O el lote entero se da por entregado (2xx) o se descarta/reintenta.
  ⇒ Valida **evento por evento**: los eventos malformados se descartan (y se registran en tu log) y
  se responde **2xx** por el resto. Reserva el **400** para un sobre roto (no es JSON, `events` no
  es un arreglo), y `401/403` para `key` incorrecta.
- Usa `5xx`/`429` **solo** para problemas transitorios (base de datos caída, sobrecarga). Un `5xx`
  por un dato que nunca será válido reintentaría para siempre.
- Una `key` mal configurada (401/403) **pierde los logs en silencio** (el cliente los descarta).
- El cuerpo de la respuesta se ignora; solo importa el status.

## 6. Esquema del evento

| Campo         | Tipo                    | Notas                                                                 |
| ------------- | ----------------------- | --------------------------------------------------------------------- |
| `id`          | string                  | Id único del evento (normalmente UUID v4; **no valides el formato**: en contextos no seguros el cliente usa un fallback aleatorio). Sirve para **idempotencia** (§8). |
| `type`        | `"error"` \| `"report"` | `error` = automático; `report` = mensaje del formulario de Contacto.   |
| `app`         | string                  | Siempre `"mi-metropolitano"` hoy. Úsalo como etiqueta: el servidor podrá recibir de otras apps. |
| `version`     | string                  | Versión del build, `1.0.<n>` en producción (el CI numera el parche); `1.0.0` en builds locales. |
| `env`         | `"dev"` \| `"prod"`     | `dev` = `ng serve`/localhost. **Filtra `env="prod"` en los dashboards.** |
| `installId`   | string                  | Id aleatorio **por instalación** (en `localStorage`). No es una huella digital; se borra al limpiar datos del sitio. Sirve para "cuántos dispositivos distintos afecta esto". |
| `ts`          | string ISO 8601 (UTC)   | Cuándo ocurrió por primera vez, **según el reloj del dispositivo** (puede estar mal).  |
| `lastSeen`    | string ISO 8601 (UTC)   | Última repetición fundida en este evento (= `ts` si `count` es 1).     |
| `count`       | integer ≥ 1             | Repeticiones del mismo error mientras esperaba en cola.               |
| `message`     | string                  | `error`: mensaje (máx. 500 car.). `report`: **texto escrito por el usuario** (máx. 2000). |
| `stack`       | string, opcional        | Solo `error`, máx. 1500 car. **Minificado en prod** (§10).            |
| `fingerprint` | string, opcional        | Solo `error`. Hash de mensaje + 3 primeras líneas del stack. **Agrupa por esto** para contar "el mismo bug". |
| `report`      | objeto, opcional        | Solo `report`: `{ "subject": string (máx. 100), "replyTo"?: string (máx. 200) }`. `subject` ∈ `Comentario` \| `Sugerencia` \| `Reporte de problema`. |
| `context`     | objeto                  | Ver abajo.                                                            |

`context`:

| Campo        | Tipo    | Ejemplo / notas                                                            |
| ------------ | ------- | -------------------------------------------------------------------------- |
| `url`        | string  | Ruta + query, p. ej. `/mi-metropolitano/?from=espana&to=benavides`. El query con estaciones ayuda mucho a reproducir bugs de rutas. |
| `userAgent`  | string  | `navigator.userAgent` completo.                                            |
| `language`   | string  | `es-PE`                                                                    |
| `timezone`   | string  | `America/Lima`                                                             |
| `screen`     | string  | `"390x844"` (ancho×alto de la pantalla).                                   |
| `standalone` | boolean | `true` si corre instalada como PWA.                                        |
| `online`     | boolean | `navigator.onLine` al capturar.                                            |

**Compatibilidad hacia adelante:** el cliente podrá añadir campos en el futuro. El receptor debe
**ignorar los campos desconocidos** (no rechazar el evento por eso) y no depender de su orden.

### JSON Schema (validación por evento)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["id", "type", "app", "version", "env", "installId", "ts", "lastSeen", "count", "message", "context"],
  "properties": {
    "id":          { "type": "string", "minLength": 1, "maxLength": 64 },
    "type":        { "enum": ["error", "report"] },
    "app":         { "type": "string", "minLength": 1, "maxLength": 64 },
    "version":     { "type": "string", "maxLength": 32 },
    "env":         { "enum": ["dev", "prod"] },
    "installId":   { "type": "string", "minLength": 1, "maxLength": 64 },
    "ts":          { "type": "string", "format": "date-time" },
    "lastSeen":    { "type": "string", "format": "date-time" },
    "count":       { "type": "integer", "minimum": 1 },
    "message":     { "type": "string", "maxLength": 2100 },
    "stack":       { "type": "string", "maxLength": 1600 },
    "fingerprint": { "type": "string", "maxLength": 16 },
    "report": {
      "type": "object",
      "required": ["subject"],
      "properties": {
        "subject": { "type": "string", "maxLength": 110 },
        "replyTo": { "type": "string", "maxLength": 210 }
      }
    },
    "context": {
      "type": "object",
      "required": ["url", "userAgent", "language", "timezone", "screen", "standalone", "online"],
      "properties": {
        "url":        { "type": "string", "maxLength": 2048 },
        "userAgent":  { "type": "string", "maxLength": 512 },
        "language":   { "type": "string", "maxLength": 32 },
        "timezone":   { "type": "string", "maxLength": 64 },
        "screen":     { "type": "string", "maxLength": 32 },
        "standalone": { "type": "boolean" },
        "online":     { "type": "boolean" }
      }
    }
  }
}
```

(Los `maxLength` llevan un pequeño margen sobre lo que envía el cliente. **No** pongas
`additionalProperties: false`: rompería la compatibilidad hacia adelante.)

### Ejemplos

Un `error`:

```json
{
  "id": "0c7e4a52-3f7b-4c1e-9d2a-6b0f8e1a9c33", "type": "error", "app": "mi-metropolitano",
  "version": "1.0.22", "env": "prod", "installId": "b1f0c9d4-7e2a-4b56-8a11-2d9c3e5f7a90",
  "ts": "2026-09-20T18:02:11.000Z", "lastSeen": "2026-09-20T18:02:14.000Z", "count": 3,
  "message": "Cannot read properties of undefined (reading 'stops')",
  "stack": "TypeError: Cannot read properties of undefined (reading 'stops')\n    at https://oficinamentaldebruno.com/mi-metropolitano/main-4DBSW4SP.js:11:48210",
  "fingerprint": "5f3a91c2",
  "context": { "url": "/mi-metropolitano/?from=espana&to=benavides", "userAgent": "Mozilla/5.0 (Linux; Android 14) …",
               "language": "es-PE", "timezone": "America/Lima", "screen": "390x844",
               "standalone": true, "online": true }
}
```

Un `report` (los datos personales de `replyTo` y `message` son opcionales / escritos por el usuario):

```json
{
  "id": "8d21b6f0-1a44-4e0b-b3c7-55a6d7e1f012", "type": "report", "app": "mi-metropolitano",
  "version": "1.0.22", "env": "prod", "installId": "b1f0c9d4-7e2a-4b56-8a11-2d9c3e5f7a90",
  "ts": "2026-09-20T18:10:00.000Z", "lastSeen": "2026-09-20T18:10:00.000Z", "count": 1,
  "message": "La Expreso 5 no aparece de noche pero sí pasa",
  "report": { "subject": "Reporte de problema", "replyTo": "persona@ejemplo.com" },
  "context": { "url": "/mi-metropolitano/?page=contacto", "userAgent": "Mozilla/5.0 …",
               "language": "es-PE", "timezone": "America/Lima", "screen": "390x844",
               "standalone": false, "online": true }
}
```

## 7. CORS (obligatorio: app y servidor son dominios distintos)

El app corre en `https://oficinamentaldebruno.com`; el servidor en `gerardoleon.dev`. **Ambos**
endpoints deben devolver, en **todas** las respuestas (incluidos los errores 4xx/5xx):

```
Access-Control-Allow-Origin: <el Origin del request, si está en tu lista permitida>
```

Lista permitida: `https://oficinamentaldebruno.com` y, para desarrollo, `http://localhost:*`
(cualquier puerto). Refleja el `Origin` solo si está en la lista; si no, no pongas la cabecera.
Añade `Vary: Origin`.

No hace falta `Access-Control-Allow-Headers`/`-Methods` ni manejar `OPTIONS`: ninguno de los dos
requests dispara preflight (verificado en un navegador real). Manejar `OPTIONS` igualmente es
inofensivo.

**Ojo con las respuestas de error sin CORS:** si un proxy o el túnel responde un 502/504 sin
cabeceras CORS, Chrome lo muestra como "CORS error" aunque la causa real sea el servidor caído. Es
un falso síntoma: el cliente lo trata igual (reintenta).

## 8. Recomendaciones para el receptor

- **Rate limit por IP** (regla de Cloudflare o del receptor) y **tope de tamaño del body de
  16 KB** (responde 413).
- **Valida el sobre y luego cada evento** contra el esquema (§6); descarta los inválidos
  individualmente y responde 2xx por el resto (§5).
- **Idempotencia por `id`.** Si un POST llegó pero la respuesta se perdió, el cliente reenvía los
  mismos eventos. Lo ideal: *upsert* por `id` quedándote con el mayor `count` y el `lastSeen` más
  reciente (un evento puede haber sumado repeticiones entre intentos). Si tu almacenamiento es
  *append-only*, ignorar `id`s repetidos es aceptable (el error de conteo es mínimo).
- **Guarda tu propio `receivedAt`** (hora del servidor). `ts` viene del reloj del dispositivo y
  puede estar desfasado o ser muy antiguo (cola de días).
- **Privacidad / datos personales:**
  - El servidor ve la **IP** de quien envía. La página "Nosotros" del app lo declara. **No la
    guardes** (desactiva el log de acceso o quítala en el receptor / en Cloudflare).
  - `type="report"`: `message` y `report.replyTo` **son datos personales** escritos por el usuario.
    Retención corta y acceso restringido; no los pongas en un dashboard público.
  - `type="error"` no debería llevar datos personales (pero `context.url` incluye el query string).
- **Lo que promete el texto legal del app** (página "Nosotros"): se envía mensaje/versión/página/
  dispositivo/ID aleatorio, "no incluye ubicación ni datos personales salvo lo que el usuario escriba
  en Contacto", y el usuario puede desactivar los reportes automáticos. Si el receptor empieza a
  guardar algo más (o a compartirlo con terceros), hay que actualizar ese texto.

## 9. Almacenamiento y dashboards (decisión abierta, del receptor)

Grafana solo **visualiza**. Opciones razonables, con sus trampas:

- **Loki** (logs): natural para "un evento = una línea". Trampas: (1) por defecto rechaza muestras
  con más de ~1 semana de antigüedad (`reject_old_samples_max_age`, verifica en tu versión) y los
  eventos de este cliente pueden llegar con días de retraso ⇒ **usa `receivedAt` como timestamp de la
  línea** y deja `ts` como campo del JSON; (2) **no uses `installId`, `fingerprint` ni `id` como
  labels** (cardinalidad alta); labels sugeridos: `app`, `env`, `type`, `version`.
- **SQLite/Postgres** (tabla): encaja mejor con "seguimiento de issues" (agrupar por `fingerprint`,
  marcar como resuelto, etc.) y con paneles de tabla de Grafana. Índices sugeridos: `fingerprint`,
  `(app, env, type, receivedAt)`, `id` único.
- Prometheus **no** sirve para los eventos individuales (solo para contadores agregados).

Consultas/paneles que el contrato soporta bien: errores por `version` (¿empeoró un release?), top
`fingerprint` sumando `count`, cantidad de `installId` distintos afectados por cada `fingerprint`,
lista de `report` recientes, errores `standalone=true` vs navegador, todo con `env="prod"`.

## 10. Stacks minificados

El build de producción genera **sourcemaps ocultos** (`main-XXXX.js.map` junto al bundle, sin el
comentario `sourceMappingURL`). Cada evento trae `version` y el `stack` minificado
(`main-XXXX.js:línea:col`). Para leerlo, descarga el `.map` de esa versión
(`https://oficinamentaldebruno.com/mi-metropolitano/main-XXXX.js.map`) y resuélvelo (a mano, o con
la librería `source-map`). Resolverlos automáticamente en el receptor **no está incluido**.

## 11. Cómo probar el receptor

Sustituye `BASE`. Todos estos casos deben cumplirse:

```bash
BASE=https://metrics.gerardoleon.dev
EV='{"id":"t-1","type":"error","app":"mi-metropolitano","version":"1.0.0","env":"dev","installId":"i-1","ts":"2026-09-20T18:00:00.000Z","lastSeen":"2026-09-20T18:00:00.000Z","count":1,"message":"prueba","context":{"url":"/","userAgent":"curl","language":"es","timezone":"America/Lima","screen":"1x1","standalone":false,"online":true}}'

# 1. health sano → 200 {"status":"healthy"} + CORS
curl -i -H 'Origin: https://oficinamentaldebruno.com' $BASE/health

# 2. lote válido → 2xx + CORS
curl -i -X POST $BASE/logs -H 'Origin: https://oficinamentaldebruno.com' \
  -H 'Content-Type: text/plain;charset=UTF-8' --data "{\"key\":\"metroapp-public\",\"events\":[$EV]}"

# 3. mismo lote otra vez (idempotencia) → 2xx, sin duplicar la fila
curl -i -X POST $BASE/logs -H 'Content-Type: text/plain;charset=UTF-8' --data "{\"key\":\"metroapp-public\",\"events\":[$EV]}"

# 4. key incorrecta → 401 o 403
curl -i -X POST $BASE/logs -H 'Content-Type: text/plain;charset=UTF-8' --data "{\"key\":\"otra\",\"events\":[$EV]}"

# 5. no es JSON → 400
curl -i -X POST $BASE/logs -H 'Content-Type: text/plain;charset=UTF-8' --data 'hola'

# 6. body > 16 KB → 413
head -c 20000 /dev/zero | tr '\0' 'x' | curl -i -X POST $BASE/logs -H 'Content-Type: text/plain;charset=UTF-8' --data-binary @-

# 7. un evento malformado dentro de un lote con uno bueno → 2xx y se guarda solo el bueno
curl -i -X POST $BASE/logs -H 'Content-Type: text/plain;charset=UTF-8' \
  --data "{\"key\":\"metroapp-public\",\"events\":[{\"basura\":true},$EV]}"

# 8. origen no permitido → sin Access-Control-Allow-Origin
curl -i -H 'Origin: https://malo.example' $BASE/health
```

Además: con el almacenamiento detenido, `/health` debe devolver **503** (y `/logs` un `5xx`).

### Probar contra el cliente real

1. En este repo: `npm start -- --port 4210` y abrir `http://localhost:4210/?page=contacto`.
   (El cliente apunta siempre a `TELEMETRY_BASE_URL`; los eventos de `ng serve` llevan `env="dev"`.)
2. Enviar un reporte desde el formulario, o provocar un error en la consola del navegador:
   `setTimeout(() => { throw new Error('prueba') })`.
3. Inspeccionar el estado del cliente en la consola:

```js
JSON.parse(localStorage.getItem('metro_telemetry_queue') || '[]') // cola pendiente (vacía = entregado)
localStorage.getItem('metro_install_id')                         // id de instalación
localStorage.getItem('metro_telemetry_off')                      // '1' = errores automáticos desactivados
```

4. Con el receptor apagado, el evento debe **quedar en la cola** y el formulario mostrar
   "Guardado en tu dispositivo…"; al encenderlo, vaciarse solo en ≤ 10 min (el siguiente reintento).
   Para forzarlo sin esperar: `window.dispatchEvent(new Event('online'))`.

## 12. Lista de verificación ("terminado" cuando…)

- [ ] `GET /health` → 200 `{"status":"healthy"}`; 503 si no puede guardar.
- [ ] `POST /logs` acepta `text/plain` con JSON, valida `key`, sobre y cada evento, y responde según §5.
- [ ] CORS correcto en **todas** las respuestas, para el origen de producción y `localhost:*` (§7).
- [ ] Idempotente por `id`; guarda `receivedAt`.
- [ ] Rate limit por IP y tope de 16 KB.
- [ ] La IP **no** se guarda; los `report` se tratan como datos personales.
- [ ] Los 8 casos de §11 dan lo esperado y el flujo con el cliente real (§11) funciona, incluido el
      caso "receptor apagado → vuelve → se vacía la cola".
- [ ] Dashboard en Grafana filtrado por `env="prod"` y agrupado por `fingerprint`.
