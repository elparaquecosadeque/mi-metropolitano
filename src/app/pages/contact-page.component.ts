import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TELEMETRY } from '../telemetry/telemetry.service';

const CONTACT_EMAIL = 'contacto@oficinamentaldebruno.com';

const SUBJECTS = ['Comentario', 'Sugerencia', 'Reporte de problema'] as const;

type Status = 'idle' | 'sending' | 'sent' | 'queued' | 'failed';

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

        <button type="submit" [disabled]="!message().trim() || status() === 'sending'">
          {{ status() === 'sending' ? 'Enviando…' : '✉️ Enviar' }}
        </button>

        <div class="status" role="status" aria-live="polite">
          @switch (status()) {
            @case ('sent') { <p class="ok">✓ Mensaje enviado. ¡Gracias!</p> }
            @case ('queued') {
              <p class="warn">
                📥 Guardado en tu dispositivo. Lo enviaremos solo cuando nuestro servidor esté disponible
                (mientras tengas la app abierta).
              </p>
            }
            @case ('failed') { <p class="error">No pudimos enviar tu mensaje. Escríbenos por correo, por favor.</p> }
          }
        </div>

        <a class="mail-link" [href]="mailtoHref()">¿Urgente? Escríbenos por correo</a>
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
    .status p { margin: 0; font-size: 0.9rem; line-height: 1.4; }
    .status .ok { color: var(--c-primary); }
    .status .warn { color: var(--c-warning); }
    .status .error { color: var(--c-danger); }
    .mail-link { align-self: flex-start; font-size: 0.85rem; color: var(--c-text-muted); }
    .mail-link:hover { color: var(--c-primary); }
  `],
})
export class ContactPageComponent {
  private readonly telemetry = inject(TELEMETRY);

  readonly subjects = SUBJECTS;
  subject = signal<string>(SUBJECTS[0]);
  replyTo = signal('');
  message = signal('');
  status = signal<Status>('idle');

  // Manual plan B: opens the user's mail client prefilled with what they've typed so far.
  readonly mailtoHref = computed(() => {
    const subject = encodeURIComponent(`Mi Metropolitano - ${this.subject()}`);
    const body = encodeURIComponent(
      this.message() + (this.replyTo() ? `\n\nCorreo de contacto: ${this.replyTo()}` : ''),
    );
    return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  });

  async send(event: Event) {
    event.preventDefault();
    if (!this.message().trim() || this.status() === 'sending') return;

    this.status.set('sending');
    const result = await this.telemetry.report({
      subject: this.subject(),
      message: this.message().trim(),
      replyTo: this.replyTo().trim() || undefined,
    });

    if (result === 'disabled') {
      // Telemetry inactive (no server configured): behave like before, hand off to the mail client.
      this.status.set('idle');
      window.location.href = this.mailtoHref();
      return;
    }
    this.status.set(result);
    if (result === 'sent' || result === 'queued') {
      this.message.set('');
      this.replyTo.set('');
    }
  }
}
