# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [1.0.0] - 2026-08-05

### Añadido
- **Versión + actualización**: número de versión visible en el footer (`Mi Metropolitano v{major}.{minor}.{patch}`). `major.minor` se sube a mano en `package.json`; `patch` se genera solo en cada build desde `github.run_number` (`scripts/generate-version.mjs`, corrido automáticamente vía `prebuild`). Si hay una versión nueva desplegada, aparece un aviso "actualiza aquí" que aplica el update del service worker y recarga.
- **Header + menú**: título centrado con ícono de menú hamburguesa a la izquierda, presente en el planificador y las páginas nuevas (no en `?admin`). El menú es un dropdown con animación de entrada/salida, sin depender de Angular Router — reutiliza el mismo patrón de query params que ya usaba `?admin`.
- **Página "Consulta de rutas"** (`?page=rutas`): acordeón con todos los expresos, troncales y lechuceros, sus paradas y horarios — para consultar una ruta sin tener que buscar origen/destino.
- **Página "Contacto / Reporte"** (`?page=contacto`): formulario simple que arma un `mailto:` al correo del proyecto.
- **Página "Nosotros"** (`?page=nosotros`): explica la iniciativa ciudadana, sin fines de lucro e independiente, con link al repositorio en GitHub.
- **Página "Cómo instalar"** (`?page=instalar`): instrucciones para iOS/Safari; en Android/Chrome muestra un botón que dispara el instalado nativo (`beforeinstallprompt`) en vez de solo instrucciones.
- **Filtro de estado en "Rutas y horarios"**: Todas / Funcionando ahora / No disponibles / Por comenzar-finalizar, calculado en vivo a partir de la hora actual (se refresca cada 60s). Cada ruta muestra un indicador de color (🟢/🟡/⚪) incluso colapsada.

### Cambiado
- El selector de tema (☀️/🌙) se movió del header del planificador al header compartido — ahora aplica en todas las páginas, no solo en el planificador.
- Se retiró el reloj decorativo que vivía en el header del planificador (redundante con el nuevo header compartido, que no tiene espacio dedicado a esto en todas las vistas).

### Corregido
- La tipografía (`system-ui`) dejó de aplicarse en el header, footer y las páginas nuevas tras moverlas fuera del `:host` del planificador — se centralizó en `body` (`src/styles.scss`) para que cubra toda la app.
- El ícono al añadir la PWA a la pantalla de inicio en iOS mostraba el logo default de Angular: los 8 tamaños en `public/icons/` nunca se habían reemplazado tras el `ng new` inicial. Se regeneraron desde el bus del favicon (`public/favicon.ico`) y se agregó `public/apple-touch-icon.png` + el `<link rel="apple-touch-icon">` correspondiente en `index.html`, que es lo que iOS usa realmente para el ícono de inicio.
- **Rutas con trasbordo desaparecían si existía un directo corto pero no disponible en ese momento** (`routing.service.ts`): el filtro anti-backtrack usaba el mínimo de paradas entre *todos* los directos encontrados, incluyendo los que no están operando ahora mismo. Ejemplo real: Angamos → Jirón de la Unión muestra un directo por Ruta C (10 paradas, disponible), pero también existe un directo del Lechucero (solo viernes/sábado 23:30–04:00) que conecta esas mismas estaciones en apenas 2 paradas. Aunque el Lechucero no corre un lunes a las 13:33, sus 2 paradas igual fijaban el umbral, y el trasbordo Expreso 1 → Estación Central → Ruta A/C (6 paradas, disponible) quedaba descartado por "demasiado largo" frente a un directo que ni siquiera se puede tomar. El umbral ahora se calcula solo con directos disponibles.
