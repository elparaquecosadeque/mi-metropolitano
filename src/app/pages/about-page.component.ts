import { Component } from '@angular/core';

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
  `],
})
export class AboutPageComponent {
  readonly repoUrl = REPO_URL;
}
