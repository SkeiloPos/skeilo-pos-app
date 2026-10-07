import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { AuthShellComponent } from '../components/auth-shell.component';

/** Clave del bloqueo de reenvío. Guarda un instante, nunca un dato personal. */
export const RESEND_LOCK_KEY = 'skeilo.auth.resend-lock-until';

const RESEND_LOCK_MS = 60_000;

/**
 * Lee el instante de vencimiento del bloqueo. Cualquier problema —almacenamiento
 * no disponible, valor corrupto— se trata como "sin bloqueo": esto es una ayuda
 * de interfaz, y el límite real lo aplica el servidor (FR-024).
 */
function leerBloqueo(): number {
  try {
    const crudo = sessionStorage.getItem(RESEND_LOCK_KEY);
    const valor = Number(crudo);
    return Number.isFinite(valor) && crudo !== null && crudo !== '' ? valor : 0;
  } catch {
    return 0;
  }
}

function escribirBloqueo(until: number): void {
  try {
    sessionStorage.setItem(RESEND_LOCK_KEY, String(until));
  } catch {
    // Sin almacenamiento el bloqueo no sobrevive a una recarga. Se acepta: la
    // protección real es la del servidor.
  }
}

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconMiComponent, AuthShellComponent],
  template: `
    <app-auth-shell>
      @if (sent()) {
        <div class="w-full flex flex-col gap-5">
          <div>
            <!-- Disco de confirmación del diseño: 56 px, redondo, con el ícono
                 de correo verificado. -->
            <div
              class="w-14 h-14 rounded-full grid place-items-center mb-4"
              style="background: var(--auth-success-soft); color: var(--auth-success)"
            >
              <app-mi-icon name="check-circle" [size]="26" />
            </div>
            <h1 class="auth-title">Revisa tu correo.</h1>

            <!-- Forma condicional, no indicativa: "Enviamos un enlace a X"
                 afirmaría que la cuenta existe y rompería FR-020 y SC-003. El
                 correo que se repite es el que la persona acaba de escribir, así
                 que no revela nada que no supiera. -->
            <p data-testid="forgot-sent" role="status" class="auth-subtitle leading-relaxed">
              Si existe una cuenta con
              <b style="color: var(--auth-text-primary)">{{ sentTo() }}</b
              >, enviamos un enlace para crear una contraseña nueva. El enlace caduca en 30 minutos.
            </p>
          </div>

          @if (errorMessage()) {
            <div data-testid="forgot-error" role="alert" class="auth-alert auth-alert-error">
              <app-mi-icon name="warning" [size]="16" />
              {{ errorMessage() }}
            </div>
          }

          <button
            data-testid="forgot-resend"
            type="button"
            [disabled]="remainingSeconds() > 0 || isLoading()"
            (click)="resend()"
            class="auth-button auth-button-secondary auth-tap-target"
          >
            @if (remainingSeconds() > 0) {
              Reenviar enlace en {{ remainingSeconds() }} s
            } @else {
              Reenviar enlace
            }
          </button>

          <a data-testid="forgot-back-link" routerLink="/login" class="auth-link-button">
            <app-mi-icon name="back" [size]="16" />
            Volver a iniciar sesión
          </a>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" class="w-full flex flex-col gap-5" novalidate>
          <div>
            <h1 class="auth-title">Restablece tu contraseña.</h1>
            <p class="auth-subtitle">
              Escribe el correo de tu cuenta y te enviamos un enlace para crear una nueva.
            </p>
          </div>

          <label for="forgot-email" class="flex flex-col gap-2 auth-field-label">
            Correo electrónico
            <input
              id="forgot-email"
              data-testid="forgot-email"
              type="email"
              formControlName="email"
              placeholder="tucorreo@negocio.co"
              autocomplete="email"
              class="auth-input"
              [class.auth-input-invalid]="emailError()"
            />
          </label>
          @if (emailError()) {
            <p class="-mt-3 text-[13px] font-medium" style="color: var(--auth-error)">
              {{ emailError() }}
            </p>
          }

          @if (errorMessage()) {
            <div data-testid="forgot-error" role="alert" class="auth-alert auth-alert-error">
              <app-mi-icon name="warning" [size]="16" />
              {{ errorMessage() }}
            </div>
          }

          <button
            data-testid="forgot-submit"
            type="submit"
            [disabled]="isLoading()"
            class="auth-button auth-tap-target"
          >
            {{ isLoading() ? 'Enviando…' : 'Enviar enlace' }}
          </button>

          <a data-testid="forgot-back-link" routerLink="/login" class="auth-link-button">
            <app-mi-icon name="back" [size]="16" />
            Volver a iniciar sesión
          </a>
        </form>
      }
    </app-auth-shell>
  `,
})
export class ForgotPasswordComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  readonly tenant = inject(TenantContextService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly sent = signal(false);
  readonly sentTo = signal('');

  /**
   * Cuenta regresiva del reenvío. Es una resta de **dos marcas de reloj**, no un
   * contador que se decrementa: una pestaña en segundo plano estrangula los
   * timers, así que un contador por ticks se alargaría; y una recarga lo
   * reiniciaría a 60. Con el instante de vencimiento guardado, ninguna de las dos
   * cosas pasa (FR-022, R10).
   */
  readonly remainingSeconds = signal(0);

  /** Solo repinta: el valor sale siempre del reloj, nunca de este intervalo. */
  private ticker: ReturnType<typeof setInterval> | null = null;

  readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
  });

  constructor() {
    this.refreshRemaining();
  }

  ngOnDestroy(): void {
    this.stopTicker();
  }

  emailError(): string | null {
    const ctrl = this.form.controls.email;
    if (!ctrl.touched || ctrl.valid) return null;
    return ctrl.hasError('required') ? 'Escribe tu correo electrónico' : 'Escribe un correo válido';
  }

  async submit(): Promise<void> {
    if (this.isLoading()) return;

    this.form.markAllAsTouched();
    if (this.form.invalid || this.tenant.isUnrecognized()) return;

    await this.request(this.form.controls.email.value!);
  }

  async resend(): Promise<void> {
    if (this.remainingSeconds() > 0) return;
    await this.request(this.sentTo());
  }

  private async request(email: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { error, status } = await this.authService.forgotPassword(email);
    this.isLoading.set(false);

    if (error) {
      // El literal es propio de la pantalla y **no** repite el `detail` del
      // servidor ni cita ninguna ventana de tiempo: el límite es configurable y
      // el texto tiene que seguir siendo verdad si cambia (FR-023, D5, R11).
      this.errorMessage.set(
        status === 429
          ? 'Hiciste demasiados intentos. Vuelve a intentarlo más tarde.'
          : 'No pudimos procesar la solicitud. Intenta de nuevo.',
      );
      return;
    }

    this.sentTo.set(email);
    this.sent.set(true);
    escribirBloqueo(Date.now() + RESEND_LOCK_MS);
    this.refreshRemaining();
  }

  private refreshRemaining(): void {
    const until = leerBloqueo();
    const restante = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    this.remainingSeconds.set(restante);

    if (restante > 0) this.startTicker();
    else this.stopTicker();
  }

  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = setInterval(() => this.refreshRemaining(), 1000);
  }

  private stopTicker(): void {
    if (this.ticker === null) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }
}
