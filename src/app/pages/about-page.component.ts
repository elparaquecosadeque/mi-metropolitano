import { Component, inject } from '@angular/core';
import { TELEMETRY } from '../telemetry/telemetry.service';

const REPO_URL = 'https://github.com/elparaquecosadeque/mi-metropolitano';

@Component({
  selector: 'app-about-page',
  standalone: true,
  template: `
    <div class="page">
      <h2>Nosotros</h2>
      <p>
        Mi Metropolitano es una iniciativa ciudadana, independiente y sin fines de lucro,
        creada para ayudar a resolver una pregunta simple: <strong>¿qué bus tomo ahora?</strong>
      </p>
      <p>
        No está afiliada a Protransporte ni a ninguna empresa operadora del Metropolitano.
        Todo el código es abierto — cualquiera puede revisarlo, corregirlo o mejorarlo.
      </p>
      <a class="repo-link" [href]="repoUrl" target="_blank" rel="noopener">💻 Ver el código en GitHub</a>

      @if (telemetry.enabled) {
        <section class="privacy">
          <h3>Privacidad y reportes de errores</h3>
          <p>
            Si el app se rompe, puede enviar un reporte automático a un servidor propio del autor para poder
            arreglarlo. El reporte incluye: el mensaje del error, la versión del app, la página donde ocurrió,
            tu tipo de dispositivo y navegador (idioma, zona horaria, tamaño de pantalla, si está instalada como
            app y si tienes conexión) y un código aleatorio de esta instalación, que solo sirve para agrupar
            errores del mismo dispositivo y se borra si limpias los datos del sitio.
          </p>
          <p>
            Además, cada vez que abres el app se envía un aviso a ese mismo servidor, solo para contar cuántas
            veces se usa: lleva la versión del app y si está instalada como app. No lleva el código de esta
            instalación ni la página que estás viendo.
          </p>
          <p>
            No se envía tu ubicación ni ningún dato personal. Lo único personal que puede llegar es lo que tú
            escribas en Contacto (y tu correo, si decides ponerlo). Como en cualquier sitio web, tu dirección IP
            es visible para el servidor que recibe el reporte, pero no se guarda. Todo lo que llega se borra a
            los 7 días.
          </p>
          <label class="toggle">
            <input
              type="checkbox"
              [checked]="telemetry.autoCapture()"
              (change)="telemetry.setAutoCapture($any($event.target).checked)"
            />
            Enviar reportes de errores automáticos y el aviso de uso
          </label>
          <p class="note">
            Esto apaga los reportes automáticos y el aviso de uso; lo que envías tú desde Contacto siempre es
            voluntario.
          </p>
        </section>
      }

      <!-- ponytail: sección de donaciones (Yape/otro) pendiente — el autor aún no decide
           qué plataforma usar sin exponer datos personales. Agregar como bloque aparte
           al final de esta página cuando esté decidido. -->
    </div>
  `,
  styles: [`
    .page { max-width: 600px; margin: 0 auto; padding: 0 1rem 1rem; }
    h2 { color: var(--c-primary); }
    p { line-height: 1.5; }
    .repo-link {
      display: inline-block;
      margin-top: 0.5rem;
      color: var(--c-primary);
      font-weight: bold;
      text-decoration: none;
    }
    .repo-link:hover { text-decoration: underline; }
    .privacy { margin-top: 1.5rem; padding-top: 0.5rem; border-top: 1px solid var(--c-border); }
    h3 { color: var(--c-primary); font-size: 1.05rem; }
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-top: 1rem;
      cursor: pointer;
    }
    .toggle input { width: 1.1rem; height: 1.1rem; accent-color: var(--c-primary); cursor: pointer; }
    .note { color: var(--c-text-muted); font-size: 0.85rem; margin-top: 0.4rem; }
  `],
})
export class AboutPageComponent {
  readonly repoUrl = REPO_URL;
  readonly telemetry = inject(TELEMETRY);
}
