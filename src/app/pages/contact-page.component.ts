import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

// Project-dedicated address — replace once a custom domain/mailbox exists.
const CONTACT_EMAIL = 'mimetropolitano.app@gmail.com';

const SUBJECTS = ['Comentario', 'Sugerencia', 'Reporte de problema'] as const;

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <h2>Contacto / Reporte de problemas</h2>
      <p class="hint">¿Encontraste un error en una ruta u horario? ¿Tienes una sugerencia? Escríbenos.</p>

      <form (submit)="send($event)">
        <label>
          Motivo
          <select [(ngModel)]="subject" name="subject">
            @for (s of subjects; track s) { <option [value]="s">{{ s }}</option> }
          </select>
        </label>

        <label>
          Tu correo (opcional, para responderte)
          <input type="email" [(ngModel)]="replyTo" name="replyTo" placeholder="tucorreo@ejemplo.com" />
        </label>

        <label>
          Mensaje
          <textarea [(ngModel)]="message" name="message" rows="5" required placeholder="Cuéntanos qué pasó..."></textarea>
        </label>

        <button type="submit" [disabled]="!message().trim()">✉️ Enviar</button>
      </form>
    </div>
  `,
  styles: [`
    .page { max-width: 600px; margin: 0 auto; padding: 0 1rem 1rem; }
    h2 { color: var(--c-primary); }
    .hint { color: var(--c-text-muted); font-size: 0.9rem; }
    form { display: flex; flex-direction: column; gap: 0.9rem; }
    label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.8rem; color: var(--c-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    select, input, textarea {
      font: inherit;
      text-transform: none;
      letter-spacing: normal;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      color: var(--c-text);
      border-radius: 8px;
      padding: 0.6rem;
      resize: vertical;
    }
    button {
      align-self: flex-start;
      background: var(--c-primary);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.6rem 1.2rem;
      font-size: 1rem;
      cursor: pointer;
    }
    button:disabled { opacity: 0.5; cursor: default; }
  `],
})
export class ContactPageComponent {
  readonly subjects = SUBJECTS;
  subject = signal<string>(SUBJECTS[0]);
  replyTo = signal('');
  message = signal('');

  send(event: Event) {
    event.preventDefault();
    if (!this.message().trim()) return;
    const subject = encodeURIComponent(`Mi Metropolitano - ${this.subject()}`);
    const bodyLines = [
      this.message(),
      this.replyTo() ? `\n\nCorreo de contacto: ${this.replyTo()}` : '',
    ];
    const body = encodeURIComponent(bodyLines.join(''));
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }
}
