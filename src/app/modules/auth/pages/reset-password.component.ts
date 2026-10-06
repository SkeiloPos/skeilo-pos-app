import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AuthApiService } from '../../../core/auth/auth-api.service';
import { AuthNoticeService } from '../../../core/auth/auth-notice.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { AuthShellComponent } from '../components/auth-shell.component';
import { PASSWORD_RULES, cumplePolitica } from '../password-policy';

/** Validator: `new_password` and `confirm_password` must match. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('new_password')?.value;
  const confirm = group.get('confirm_password')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

/**
 * Validador derivado de `PASSWORD_RULES`, no escrito a mano: la lista que el
 * usuario ve y lo que el formulario acepta salen de la misma fuente, así que no
 * pueden discrepar (FR-029, R13).
 */
function politicaVigente(control: AbstractControl): ValidationErrors | null {
  const value = (control.value ?? '') as string;
  if (value === '') return null; // la obligatoriedad la cubre `required`
  return cumplePolitica(value) ? null : { policy: true };
}

/**
 * El estado `'done'` del diseño desapareció: el éxito navega a `/login` con el
 * aviso, en vez de dejar al usuario en una pantalla cuyo propósito ya se cumplió
 * (FR-031, A-110).
 */
type ScreenState = 'checking' | 'form' | 'invalid' | 'network-error';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PasswordInputComponent,
    IconMiComponent,
    AuthShellComponent,
  ],
  template: `
    <app-auth-shell>
      @switch (state()) {
        @case ('checking') {
          <p role="status" class="auth-subtitle">Verificando el enlace…</p>
        }

        @case ('network-error') {
          <!-- Un fallo de red al validar NO es un enlace inválido: son estados
               distintos, y confundirlos manda al usuario a pedir un enlace nuevo
               que no necesita. -->
          <div class="w-full flex flex-col gap-5">
            <div>
              <h1 class="auth-title">No pudimos verificar el enlace</h1>
              <p role="alert" class="auth-subtitle leading-relaxed">
                No pudimos procesar la solicitud. Intenta de nuevo.
              </p>
            </div>
            <button type="button" (click)="validateLink()" class="auth-button auth-tap-target">
              Reintentar
            </button>
          </div>
        }

        @case ('invalid') {
          <!-- Un solo mensaje para los cuatro motivos (vencido, usado,
               invalidado, inexistente): la acción es la misma en los cuatro, así
               que distinguirlos no le daba nada accionable al usuario (FR-032).
               El motivo se sigue leyendo como dato de diagnóstico. -->
          <div class="w-full flex flex-col gap-5">
            <div>
              <div
                class="w-14 h-14 rounded-full grid place-items-center mb-4"
                style="background: var(--auth-error-soft); color: var(--auth-error)"
              >
                <app-mi-icon name="warning" [size]="26" />
              </div>
              <h1 data-testid="reset-invalid" class="auth-title">Este enlace ya no es válido</h1>
              <p class="auth-subtitle leading-relaxed">
                Pide uno nuevo para crear tu contraseña.
              </p>
            </div>
            <a
              data-testid="reset-request-new"
              routerLink="/forgot-password"
              class="auth-button auth-tap-target no-underline"
            >
              Solicitar un enlace nuevo
            </a>
          </div>
        }

        @case ('form') {
          <form
            [formGroup]="form"
            (ngSubmit)="submit()"
            class="w-full flex flex-col gap-5"
            novalidate
          >
            <div>
              <h1 class="auth-title">Crea tu nueva contraseña.</h1>
              <p class="auth-subtitle">Debe cumplir estos requisitos:</p>
            </div>

            <div class="flex flex-col gap-2">
              <label for="reset-new-password" class="auth-field-label">Nueva contraseña</label>
              <app-password-input
                [id]="'reset-new-password'"
                data-testid="reset-new-password"
                formControlName="new_password"
                placeholder="Escribe tu nueva contraseña"
                autocomplete="new-password"
                sizeClass="auth-input auth-input-password"
                [invalid]="invalid('new_password')"
              />
              @if (invalid('new_password')) {
                <p class="text-[13px] font-medium" style="color: var(--auth-error)">
                  La contraseña debe tener entre 8 y 12 caracteres
                </p>
              }
            </div>

            <!-- Ícono + etiqueta + sufijo para lectores: el estado nunca se
                 comunica solo por color (FR-028, A8). El sufijo va oculto a la
                 vista y disponible para las ayudas técnicas, como en el diseño. -->
            <ul
              data-testid="reset-policy-list"
              aria-label="Requisitos de la contraseña"
              aria-live="polite"
              class="list-none -mt-1.5 p-0 flex flex-col gap-2"
            >
              @for (regla of ruleStates(); track regla.label) {
                <li
                  class="flex items-center gap-2.5 text-sm"
                  [style.color]="regla.met ? 'var(--auth-success)' : 'var(--auth-text-muted)'"
                >
                  <span
                    class="w-[22px] h-[22px] rounded-full grid place-items-center shrink-0"
                    [style.background]="
                      regla.met ? 'var(--auth-success-soft)' : 'var(--auth-surface-soft)'
                    "
                  >
                    <app-mi-icon [name]="regla.icon" [size]="14" />
                  </span>
                  {{ regla.label }}
                  <span class="sr-only">{{ regla.srSuffix }}</span>
                </li>
              }
            </ul>

            <div class="flex flex-col gap-2">
              <label for="reset-confirm-password" class="auth-field-label">
                Confirmar contraseña
              </label>
              <app-password-input
                [id]="'reset-confirm-password'"
                data-testid="reset-confirm-password"
                formControlName="confirm_password"
                placeholder="Repite tu nueva contraseña"
                autocomplete="new-password"
                sizeClass="auth-input auth-input-password"
                [invalid]="confirmInvalid()"
              />
              @if (confirmInvalid()) {
                <p role="alert" class="text-[13px] font-medium" style="color: var(--auth-error)">
                  Las contraseñas no coinciden
                </p>
              }
            </div>

            @if (errorMessage()) {
              <div data-testid="reset-error" role="alert" class="auth-alert auth-alert-error">
                <app-mi-icon name="warning" [size]="16" />
                {{ errorMessage() }}
              </div>
            }

            <button
              data-testid="reset-submit"
              type="submit"
              [disabled]="isLoading()"
              class="auth-button auth-tap-target"
            >
              {{ isLoading() ? 'Guardando…' : 'Guardar contraseña' }}
            </button>

            <a routerLink="/login" class="auth-link-button">
              <app-mi-icon name="back" [size]="16" />
              Volver a iniciar sesión
            </a>
          </form>
        }
      }
    </app-auth-shell>
  `,
})
export class ResetPasswordComponent implements OnInit {
  private readonly authApi = inject(AuthApiService);
  private readonly authService = inject(AuthService);
  private readonly authNotice = inject(AuthNoticeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly tenant = inject(TenantContextService);

  private token = '';

  readonly state = signal<ScreenState>('checking');
  /** Se conserva como dato de diagnóstico; ya no se traduce a texto visible. */
  readonly invalidReason = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = new FormGroup(
    {
      new_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, politicaVigente],
      }),
      confirm_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  /** Estado de cada regla, derivado de la misma fuente que el validador. */
  private readonly newPassword = signal('');
  readonly ruleStates = computed(() => {
    const value = this.newPassword();
    return PASSWORD_RULES.map((rule) => {
      const met = rule.test(value);
      return {
        label: rule.label,
        met,
        icon: met ? 'check' : 'circle',
        srSuffix: met ? '(cumplido)' : '(pendiente)',
      };
    });
  });

  constructor() {
    this.form.controls.new_password.valueChanges.subscribe((v) => this.newPassword.set(v ?? ''));
  }

  async ngOnInit(): Promise<void> {
    // Cualquier sesión existente se limpia antes de mostrar el formulario
    // (FR-006) — el enlace de reset no depende de, ni preserva, una sesión.
    this.authService.clearSession();

    // Host no reconocido: el cascarón ya muestra el aviso, y disparar la
    // validación aquí saldría sin cabecera `X-Tenant-Host` (FR-009, R6).
    if (this.tenant.isUnrecognized()) return;

    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      // Sin token no hay nada que preguntar: el estado se decide sin petición.
      this.invalidReason.set('invalid');
      this.state.set('invalid');
      return;
    }

    await this.validateLink();
  }

  async validateLink(): Promise<void> {
    this.state.set('checking');
    try {
      // El backend responde 200 solo cuando el enlace está vigente — los casos
      // "expired"/"used"/"invalid" llegan como 400/404 (ver contrato), así que
      // HttpClient los entrega como error, no como valid:false. Y es un GET sin
      // efecto secundario: validar no consume el enlace (FR-034).
      await firstValueFrom(this.authApi.validateResetToken(this.token));
      this.state.set('form');
    } catch (err) {
      const status = (err as { status?: number })?.status;
      // Un 0 es la red caída, no un enlace vencido. Mandar a pedir un enlace
      // nuevo en ese caso sería mentirle al usuario sobre lo que pasó.
      if (status === 0) {
        this.state.set('network-error');
        return;
      }
      const reason = (err as { error?: { reason?: unknown } })?.error?.reason;
      this.invalidReason.set(typeof reason === 'string' ? reason : 'invalid');
      this.state.set('invalid');
    }
  }

  invalid(name: 'new_password' | 'confirm_password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  confirmInvalid(): boolean {
    const control = this.form.controls.confirm_password;
    return (control.invalid || this.form.hasError('mismatch')) && control.touched;
  }

  async submit(): Promise<void> {
    if (this.isLoading()) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { new_password } = this.form.getRawValue();
    const { error, status } = await this.authService.resetPassword(this.token, new_password);

    this.isLoading.set(false);

    if (error) {
      // El mensaje del servidor se muestra tal cual (FR-033): el cliente no
      // conoce la contraseña actual y no puede inventar ese texto. La excepción
      // es la red caída, donde no hay mensaje del servidor que mostrar.
      this.errorMessage.set(
        status === 0 ? 'No pudimos procesar la solicitud. Intenta de nuevo.' : error,
      );
      return;
    }

    // El éxito aterriza en `/login`, no aquí (FR-031, A-110).
    this.authNotice.set('password-updated');
    this.router.navigate(['/login']);
  }
}
