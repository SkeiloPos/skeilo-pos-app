import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import { ToastService } from '../../../shared/feedback/toast.service';

/** Validator: `new_password` and `confirm_password` must match. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('new_password')?.value;
  const confirm = group.get('confirm_password')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.MESERO]: 'Mesero',
  [UserRole.KITCHEN]: 'Cocina',
};

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [ReactiveFormsModule, PasswordInputComponent],
  template: `
    <div class="max-w-lg space-y-6">
      <!-- Cuenta -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">👤</span>
          <div>
            <h2 class="text-base font-semibold text-gray-900">Tu cuenta</h2>
            <p class="text-xs text-gray-400">Información de tu perfil personal</p>
          </div>
        </div>
        <dl class="space-y-3 text-sm">
          <div class="flex justify-between gap-3">
            <dt class="text-gray-500">Correo</dt>
            <dd class="font-medium text-gray-900 text-right break-all">{{ email() }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-gray-500">Rol</dt>
            <dd class="text-right">
              <span class="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {{ roleLabel() }}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <!-- Cambiar contraseña -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div class="flex items-center gap-3 mb-4">
          <span class="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl">🔒</span>
          <div>
            <h2 class="text-base font-semibold text-gray-900">Cambiar contraseña</h2>
            <p class="text-xs text-gray-400">Entre 8 y 12 caracteres, distinta de la actual</p>
          </div>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4" novalidate>
          @if (errorMessage()) {
            <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {{ errorMessage() }}
            </div>
          }

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Contraseña actual</label>
            <app-password-input
              formControlName="current_password"
              placeholder="Tu contraseña actual"
              autocomplete="current-password"
              sizeClass="px-3 py-2 rounded-xl text-sm"
              [invalid]="invalid('current_password')"
            />
            @if (invalid('current_password')) {
              <p class="text-red-500 text-xs mt-1">La contraseña actual es requerida</p>
            }
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">Nueva contraseña</label>
            <app-password-input
              formControlName="new_password"
              placeholder="Entre 8 y 12 caracteres"
              autocomplete="new-password"
              sizeClass="px-3 py-2 rounded-xl text-sm"
              [invalid]="invalid('new_password')"
            />
            @if (invalid('new_password')) {
              <p class="text-red-500 text-xs mt-1">Entre 8 y 12 caracteres</p>
            }
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Confirmar nueva contraseña
            </label>
            <app-password-input
              formControlName="confirm_password"
              placeholder="Repite la nueva contraseña"
              autocomplete="new-password"
              sizeClass="px-3 py-2 rounded-xl text-sm"
              [invalid]="confirmInvalid()"
            />
            @if (confirmInvalid()) {
              <p class="text-red-500 text-xs mt-1">Las contraseñas no coinciden</p>
            }
          </div>

          <button
            type="submit"
            [disabled]="isLoading()"
            class="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ isLoading() ? 'Actualizando...' : 'Actualizar contraseña' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class AccountSettingsComponent {
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly email = computed(() => this.authService.currentUser()?.email ?? '');
  readonly roleLabel = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role ? ROLE_LABEL[role] : '—';
  });

  readonly form = new FormGroup(
    {
      current_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      new_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(8), Validators.maxLength(12)],
      }),
      confirm_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  invalid(name: 'current_password' | 'new_password' | 'confirm_password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  confirmInvalid(): boolean {
    const control = this.form.controls.confirm_password;
    return (control.invalid || this.form.hasError('mismatch')) && control.touched;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { current_password, new_password } = this.form.getRawValue();
    // Igual que ChangePasswordComponent: AuthService.changePassword() vuelve
    // a loguearse con la contraseña nueva, así que la sesión de esta pestaña
    // sigue activa sin interrupción (FR-017).
    const { error } = await this.authService.changePassword(current_password, new_password);

    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.toast.success('Contraseña actualizada correctamente');
    this.form.reset();
  }
}
