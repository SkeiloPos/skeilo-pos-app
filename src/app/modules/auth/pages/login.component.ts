import { Component, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AuthNoticeService } from '../../../core/auth/auth-notice.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { AuthShellComponent } from '../components/auth-shell.component';

const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '/dashboard/admin',
  [UserRole.ADMIN]: '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.MESERO]: '/dashboard/mesas-sesiones',
};

/**
 * Only an in-app path is accepted as a post-login destination. `returnUrl` comes
 * from the query string, so anyone can set it; without this check a crafted link
 * would turn the login screen into an open redirect. A leading `//` is excluded
 * because browsers read it as protocol-relative, i.e. another host.
 */
function esDestinoInterno(url: string | null): url is string {
  return !!url && url.startsWith('/') && !url.startsWith('//');
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    PasswordInputComponent,
    RouterLink,
    IconMiComponent,
    AuthShellComponent,
  ],
  template: `
    <app-auth-shell>
      <form
        [formGroup]="form"
        (ngSubmit)="submit()"
        class="w-full flex flex-col gap-5"
        novalidate
      >
        <div>
          <h1 class="auth-title">Bienvenido de nuevo.</h1>
          <p class="auth-subtitle">Inicia sesión para acceder a tu cuenta.</p>
        </div>

        @if (notice()) {
          <div data-testid="login-notice" role="status" class="auth-alert auth-alert-success">
            <app-mi-icon name="check-circle" [size]="16" />
            Contraseña actualizada
          </div>
        }

        <label for="login-email" class="flex flex-col gap-2 auth-field-label">
          Correo electrónico
          <input
            id="login-email"
            data-testid="login-email"
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

        <div class="flex flex-col gap-2">
          <label for="login-password" class="auth-field-label">Contraseña</label>
          <!-- [id] como binding, no como atributo: escrito "id=..." Angular lo
               dejaría también en el host, y entonces el <label for> apuntaría al
               elemento equivocado y el id quedaría duplicado en el documento. -->
          <app-password-input
            [id]="'login-password'"
            data-testid="login-password"
            formControlName="password"
            placeholder="Escribe tu contraseña"
            autocomplete="current-password"
            sizeClass="auth-input auth-input-password"
            [invalid]="!!passwordError()"
          />
          @if (passwordError()) {
            <p class="text-[13px] font-medium" style="color: var(--auth-error)">
              {{ passwordError() }}
            </p>
          }

          <div class="flex justify-between items-center gap-3 flex-wrap min-h-[44px]">
            <!-- Control inerte por contrato (FR-019a a FR-019e): estado local y
                 nada más. No entra en el FormGroup, no viaja al servidor, no
                 persiste nada, y su texto no promete que se guarde la contraseña
                 — porque no se guarda. -->
            <label
              for="login-keep-session"
              class="inline-flex items-center gap-2.5 min-h-[24px] cursor-pointer"
            >
              <input
                id="login-keep-session"
                data-testid="login-keep-session"
                type="checkbox"
                class="auth-checkbox"
                [checked]="keepSession()"
                (change)="keepSession.set($any($event.target).checked)"
              />
              <span class="text-sm" style="color: var(--auth-text-secondary)">
                Mantener sesión iniciada
              </span>
            </label>

            <a
              data-testid="login-forgot-link"
              routerLink="/forgot-password"
              class="auth-link-inline"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
        </div>

        @if (errorMessage()) {
          <div data-testid="login-error" role="alert" class="auth-alert auth-alert-error">
            <app-mi-icon name="warning" [size]="16" />
            {{ errorMessage() }}
          </div>
        }

        <button
          data-testid="login-submit"
          type="submit"
          [disabled]="isLoading()"
          class="auth-button auth-tap-target"
        >
          @if (isLoading()) {
            <app-mi-icon name="autorenew" ariaLabel="Cargando" [size]="16" class="animate-spin" />
            Ingresando…
          } @else {
            Iniciar sesión
          }
        </button>
      </form>
    </app-auth-shell>
  `,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly authNotice = inject(AuthNoticeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute, { optional: true });
  readonly tenant = inject(TenantContextService);

  private readonly passwordField = viewChild(PasswordInputComponent);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** Estado local del control inerte. Nunca sale de aquí (FR-019c). */
  readonly keepSession = signal(false);

  /**
   * Se consume al montar, una sola vez: una recarga de `/login` ya no repite el
   * aviso, y como vive en memoria y no en la URL, no se puede fabricar desde
   * fuera (FR-031, R12).
   */
  readonly notice = signal(this.authNotice.consume());

  /** Destino que el usuario intentaba abrir antes de que el guard lo trajera aquí (FR-018). */
  redirectTo: string | null = null;

  readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  constructor() {
    const destino = this.route?.snapshot.queryParamMap.get('returnUrl') ?? null;
    if (esDestinoInterno(destino)) this.redirectTo = destino;
  }

  emailError(): string | null {
    const ctrl = this.form.controls.email;
    if (!ctrl.touched || ctrl.valid) return null;
    return ctrl.hasError('required') ? 'Escribe tu correo electrónico' : 'Escribe un correo válido';
  }

  passwordError(): string | null {
    const ctrl = this.form.controls.password;
    return ctrl.touched && ctrl.invalid ? 'Escribe tu contraseña' : null;
  }

  async submit(): Promise<void> {
    // Primera barrera de FR-015/SC-009: mientras una petición está en curso, otro
    // envío no sale. El botón deshabilitado solo cubre el clic; esto cubre también
    // el Enter y el doble disparo del formulario.
    if (this.isLoading()) return;

    this.form.markAllAsTouched();
    if (this.form.invalid || this.tenant.isUnrecognized()) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.value;
    // Exactamente dos argumentos: la casilla no viaja (FR-019c).
    const { error } = await this.authService.login(email!, password!);

    if (error) {
      this.errorMessage.set(error);
      this.isLoading.set(false);
      // FR-013: la contraseña se borra y recupera el foco; el correo se conserva,
      // porque reescribirlo es trabajo que el fallo no justifica.
      this.form.controls.password.reset('');
      this.form.controls.password.markAsUntouched();
      this.passwordField()?.focus();
      return;
    }

    const user = this.authService.currentUser();
    if (user) {
      // A temporary password must be changed before entering the app.
      if (user.mustChangePassword) {
        this.router.navigate(['/change-password']);
        return;
      }
      if (this.redirectTo) {
        this.router.navigate([this.redirectTo]);
        return;
      }
      // `admin.<dominio>` → Super Admin area; tenant subdomain → role-based POS home.
      const target = this.tenant.isSuperAdmin() ? '/super-admin' : ROLE_HOME[user.role];
      this.router.navigate([target]);
    }

    this.isLoading.set(false);
  }
}
