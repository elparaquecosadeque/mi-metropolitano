import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

const CONTACT_EMAIL = 'contacto@oficinamentaldebruno.com';

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

        <input class="honey" type="text" [(ngModel)]="honey" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" />

        <button type="submit" [disabled]="!message().trim() || status() === 'sending'">
          {{ status() === 'sending' ? 'Enviando…' : '✉️ Enviar' }}
        </button>

        @if (status() === 'sent') {
          <p class="status ok">✓ Mensaje enviado. ¡Gracias!</p>
        }
        @if (status() === 'error') {
          <p class="status error">No se pudo enviar. Escríbenos directamente a {{ contactEmail }}</p>
        }
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
    .honey { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    .status { font-size: 0.9rem; margin: 0; }
    .status.ok { color: var(--c-primary); }
    .status.error { color: var(--c-danger); }
  `],
})
export class ContactPageComponent {
  readonly subjects = SUBJECTS;
  readonly contactEmail = CONTACT_EMAIL;
  subject = signal<string>(SUBJECTS[0]);
  replyTo = signal('');
  message = signal('');
  honey = signal('');
  status = signal<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async send(event: Event) {
    event.preventDefault();
    if (!this.message().trim() || this.honey()) return;

    this.status.set('sending');
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          message: this.message(),
          _subject: `Mi Metropolitano - ${this.subject()}`,
          ...(this.replyTo() ? { _replyto: this.replyTo() } : {}),
          _captcha: 'false',
        }),
      });
      // FormSubmit returns HTTP 200 even on failure (e.g. pending activation) — the real
      // result is in the JSON body's `success` field, not the status code.
      const data = await res.json();
      if (!res.ok || data.success !== 'true') throw new Error(data.message ?? `FormSubmit responded ${res.status}`);

      this.status.set('sent');
      this.message.set('');
      this.replyTo.set('');
    } catch {
      this.status.set('error');
    }
  }
}
