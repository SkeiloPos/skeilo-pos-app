import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '/dashboard/admin',
  [UserRole.ADMIN]: '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.MESERO]: '/dashboard/mesas-sesiones',
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, PasswordInputComponent, RouterLink, IconMiComponent],
  template: `
    <!-- lg:h-screen (y no solo min-h): fija el alto al viewport para que el panel
         derecho no empuje la página y deje el pie fuera de pantalla. -->
    <div class="min-h-screen lg:h-screen bg-white flex flex-col lg:flex-row">
      <!-- Columna del formulario -->
      <div class="flex-1 flex flex-col px-6 py-8 sm:px-12 lg:px-16 lg:overflow-y-auto">
        <img src="/logo.svg" alt="SkeiloPOS" class="w-10 h-10 rounded-xl shrink-0" />

        <div class="flex-1 flex items-center py-8">
          <div class="w-full max-w-sm mx-auto lg:mx-0">
            <!-- Contexto resuelto por el dominio, no elegido a mano: dice en qué
                 puerta estás llamando antes de teclear las credenciales. -->
            @if (tenant.isUnrecognized()) {
              <!-- Host sin acceso (dominio raíz, reservado o desconocido): sin formulario
                   y sin llamadas al API (spec 091, FR-005/FR-006). -->
              <div
                data-testid="unrecognized-host"
                class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-amber-800"
              >
                <h1 class="text-lg font-bold">Esta dirección no corresponde a ningún acceso</h1>
                <p class="text-sm mt-2 leading-relaxed">
                  Verifica la dirección e ingresa desde el enlace de tu negocio o desde el acceso de
                  administración de la plataforma.
                </p>
              </div>
            } @else {
            @if (tenant.isSuperAdmin()) {
              <span
                class="inline-flex items-center gap-1.5 mb-5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Acceso Super Admin
              </span>
            } @else {
              <span
                class="inline-flex items-center gap-1.5 mb-5 px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                {{ tenant.tenantSlug() }}
              </span>
            }

            <!-- El emoji no se separa del texto: en móvil caía solo a la línea de abajo. -->
            <h1 class="text-2xl sm:text-3xl font-bold text-gray-900">
              Bienvenido de nuevo&nbsp;👋
            </h1>
            <p class="text-sm text-gray-500 mt-2 leading-relaxed">
              Ingresa tus credenciales para entrar al sistema y empezar el turno.
            </p>

            <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-4">
              @if (errorMessage()) {
                <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {{ errorMessage() }}
                </div>
              }

              <div>
                <label for="email" class="block text-xs font-semibold text-gray-700 mb-1.5">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  formControlName="email"
                  placeholder="tu@correo.com"
                  autocomplete="email"
                  class="w-full px-4 py-2.5 rounded-lg bg-gray-50 border focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-gray-900 placeholder-gray-400 text-sm transition"
                  [class.border-red-400]="emailInvalid"
                  [class.border-gray-200]="!emailInvalid"
                />
                @if (emailInvalid) {
                  <p class="text-red-500 text-xs mt-1">Ingresa un correo válido</p>
                }
              </div>

              <div>
                <label for="password" class="block text-xs font-semibold text-gray-700 mb-1.5">
                  Contraseña
                </label>
                <app-password-input
                  id="password"
                  formControlName="password"
                  placeholder="Tu contraseña"
                  autocomplete="current-password"
                  sizeClass="px-4 py-2.5 rounded-lg bg-gray-50 text-sm"
                  [invalid]="passwordInvalid"
                />
                @if (passwordInvalid) {
                  <p class="text-red-500 text-xs mt-1">La contraseña es requerida</p>
                }
                <a
                  routerLink="/forgot-password"
                  class="inline-block mt-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Restablecer contraseña
                </a>
              </div>

              <button
                type="submit"
                [disabled]="isLoading()"
                class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 rounded-lg transition-colors text-sm flex items-center justify-center gap-2 mt-2"
              >
                @if (isLoading()) {
                  <app-mi-icon name="autorenew" ariaLabel="Cargando" [size]="16" class="animate-spin" />
                  Ingresando...
                } @else {
                  Iniciar sesión
                }
              </button>
            </form>
            }
          </div>
        </div>

        <p class="text-xs text-gray-400 text-center lg:text-left">
          © {{ year }} SkeiloPOS · Todos los derechos reservados
        </p>
      </div>

      <!-- Panel decorativo. Se oculta en móvil: ahí el alto es para el formulario. -->
      <div class="hidden lg:flex lg:w-[45%] p-3">
        <img
          src="/images/login-panel.svg"
          alt=""
          aria-hidden="true"
          class="w-full h-full object-cover rounded-3xl"
        />
      </div>
    </div>
  `,
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly tenant = inject(TenantContextService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** Calculado, no escrito a mano: un año fijo en el pie envejece solo. */
  readonly year = new Date().getFullYear();

  readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  get emailInvalid(): boolean {
    const ctrl = this.form.get('email')!;
    return ctrl.invalid && ctrl.touched;
  }

  get passwordInvalid(): boolean {
    const ctrl = this.form.get('password')!;
    return ctrl.invalid && ctrl.touched;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.tenant.isUnrecognized()) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.value;
    const { error } = await this.authService.login(email!, password!);

    if (error) {
      this.errorMessage.set(error);
      this.isLoading.set(false);
      return;
    }

    const user = this.authService.currentUser();
    if (user) {
      // A temporary password must be changed before entering the app.
      if (user.mustChangePassword) {
        this.router.navigate(['/change-password']);
        return;
      }
      // `admin.<dominio>` → Super Admin area; tenant subdomain → role-based POS home.
      const target = this.tenant.isSuperAdmin() ? '/super-admin' : ROLE_HOME[user.role];
      this.router.navigate([target]);
    }
  }
}
