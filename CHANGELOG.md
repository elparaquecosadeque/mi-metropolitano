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

### Cambiado
- El selector de tema (☀️/🌙) se movió del header del planificador al header compartido — ahora aplica en todas las páginas, no solo en el planificador.
- Se retiró el reloj decorativo que vivía en el header del planificador (redundante con el nuevo header compartido, que no tiene espacio dedicado a esto en todas las vistas).
