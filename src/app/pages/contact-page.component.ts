import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TELEMETRY } from '../telemetry/telemetry.service';
import { I18nService } from '../i18n/i18n.service';

const CONTACT_EMAIL = 'contacto@oficinamentaldebruno.com';

/** sessionStorage key a gate-drawer "report incorrect gate" button fills in before navigating here. */
const REPORT_DRAFT_KEY = 'metro_report_draft';

const SUBJECT_KEYS = ['contact.subject.comment', 'contact.subject.suggestion', 'contact.subject.report'] as const;

type Status = 'idle' | 'sending' | 'sent' | 'queued' | 'failed';

@Component({
  selector: 'app-contact-page',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">
      <h2>{{ i18n.t('contact.title') }}</h2>
      <p class="hint">{{ i18n.t('contact.hint') }}</p>

      <form (submit)="send($event)">
        <label>
          {{ i18n.t('contact.subjectLabel') }}
          <select [(ngModel)]="subject" name="subject">
            @for (key of subjectKeys; track key) { <option [value]="key">{{ i18n.t(key) }}</option> }
          </select>
        </label>

        <label>
          {{ i18n.t('contact.emailLabel') }}
          <input type="email" [(ngModel)]="replyTo" name="replyTo" placeholder="tucorreo@ejemplo.com" />
        </label>

        <label>
          {{ i18n.t('contact.messageLabel') }}
          <textarea [(ngModel)]="message" name="message" rows="5" required [placeholder]="i18n.t('contact.messagePlaceholder')"></textarea>
        </label>

        <button type="submit" [disabled]="!message().trim() || status() === 'sending'">
          {{ status() === 'sending' ? i18n.t('contact.sending') : i18n.t('contact.send') }}
        </button>

        <div class="status" role="status" aria-live="polite">
          @switch (status()) {
            @case ('sent') { <p class="ok">{{ i18n.t('contact.sent') }}</p> }
            @case ('queued') { <p class="warn">{{ i18n.t('contact.queued') }}</p> }
            @case ('failed') { <p class="error">{{ i18n.t('contact.failed') }}</p> }
          }
        </div>

        <a class="mail-link" [href]="mailtoHref()">{{ i18n.t('contact.urgentMail') }}</a>
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
  readonly i18n = inject(I18nService);

  readonly subjectKeys = SUBJECT_KEYS;
  subject = signal<string>(SUBJECT_KEYS[0]);
  replyTo = signal('');
  message = signal('');
  status = signal<Status>('idle');

  constructor() {
    const draft = sessionStorage.getItem(REPORT_DRAFT_KEY);
    if (draft) {
      sessionStorage.removeItem(REPORT_DRAFT_KEY);
      this.subject.set('contact.subject.report');
      this.message.set(draft);
    }
  }

  // Manual plan B: opens the user's mail client prefilled with what they've typed so far.
  readonly mailtoHref = computed(() => {
    const subject = encodeURIComponent(`Mi Metropolitano - ${this.i18n.t(this.subject())}`);
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
      subject: this.i18n.t(this.subject()),
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
