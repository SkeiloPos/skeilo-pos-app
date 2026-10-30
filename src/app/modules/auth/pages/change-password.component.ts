import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { UserRole } from '../../../core/interfaces/user.interface';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { AuthShellComponent } from '../components/auth-shell.component';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { PASSWORD_RULES, cumplePolitica } from '../password-policy';

const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: '/dashboard/admin',
  [UserRole.ADMIN]: '/dashboard/admin',
  [UserRole.CASHIER]: '/dashboard/caja',
  [UserRole.MESERO]: '/dashboard/mesas-sesiones',
};

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Admin',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.CASHIER]: 'Cajero',
  [UserRole.MESERO]: 'Mesero',
};

/** Validator: `new_password` and `confirm_password` must match. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('new_password')?.value;
  const confirm = group.get('confirm_password')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

/**
 * Validador de `new_password` derivado de `cumplePolitica()` más la regla
 * "distinta a la temporal" (no modelada en `password-policy.ts` porque esa
 * fuente la comparte `reset-password.component.ts`, que no conoce ninguna
 * contraseña actual). `getCurrent` se evalúa en cada validación, nunca en la
 * construcción del formulario, así que puede leer un signal que todavía no
 * existe al declarar este control.
 */
function politicaYDistinta(getCurrent: () => string) {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? '') as string;
    if (value === '') return null; // la obligatoriedad la cubre `required`
    if (!cumplePolitica(value)) return { policy: true };
    if (value === getCurrent()) return { sameAsCurrent: true };
    return null;
  };
}

type ScreenState = 'form' | 'done';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [ReactiveFormsModule, PasswordInputComponent, IconMiComponent, AuthShellComponent],
  template: `
    <app-auth-shell>
      @switch (screenState()) {
        @case ('form') {
          <form
            [formGroup]="form"
            (ngSubmit)="submit()"
            class="w-full flex flex-col gap-5"
            novalidate
          >
            <div>
              <h1 class="auth-title">Cambia tu contraseña.</h1>
              <p class="auth-subtitle leading-relaxed">
                Te invitaron como <b style="color: var(--auth-text-primary)">{{ roleLabel() }}</b>
                en
                <b style="color: var(--auth-text-primary)">{{ tenantInfo.info()?.name }}</b> con la
                cuenta
                <b style="color: var(--auth-text-primary)">{{ authService.currentUser()?.email }}</b
                >. Por seguridad, define una nueva contraseña para continuar.
              </p>
            </div>

            <div class="flex flex-col gap-2">
              <label for="change-password-current" class="auth-field-label">
                Contraseña temporal
              </label>
              <app-password-input
                [id]="'change-password-current'"
                data-testid="change-password-current"
                formControlName="current_password"
                placeholder="La que viene en tu invitación"
                autocomplete="current-password"
                sizeClass="auth-input auth-input-password"
                [invalid]="invalid('current_password')"
              />
            </div>

            <div class="flex flex-col gap-2">
              <label for="change-password-new" class="auth-field-label">Nueva contraseña</label>
              <app-password-input
                [id]="'change-password-new'"
                data-testid="change-password-new"
                formControlName="new_password"
                placeholder="Entre 8 y 12 caracteres"
                autocomplete="new-password"
                sizeClass="auth-input auth-input-password"
                [invalid]="invalid('new_password')"
              />
            </div>

            @if (showRules()) {
              <ul
                data-testid="change-password-rules"
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
            }

            <div class="flex flex-col gap-2">
              <label for="change-password-confirm" class="auth-field-label">
                Confirmar nueva contraseña
              </label>
              <app-password-input
                [id]="'change-password-confirm'"
                data-testid="change-password-confirm"
                formControlName="confirm_password"
                placeholder="Repite la nueva contraseña"
                autocomplete="new-password"
                sizeClass="auth-input auth-input-password"
                [invalid]="confirmInvalid()"
              />
            </div>

            @if (errorMessage()) {
              <div data-testid="change-password-error" role="alert" class="auth-alert auth-alert-error">
                <app-mi-icon name="warning" [size]="16" />
                {{ errorMessage() }}
              </div>
            }

            <button
              data-testid="change-password-submit"
              type="submit"
              [disabled]="isLoading()"
              class="auth-button auth-tap-target"
            >
              {{ isLoading() ? 'Guardando…' : 'Cambiar contraseña' }}
            </button>
          </form>
        }

        @case ('done') {
          <div data-testid="change-password-done" role="status" class="w-full flex flex-col gap-5">
            <div>
              <div
                class="w-14 h-14 rounded-full grid place-items-center mb-4"
                style="background: var(--auth-success-soft); color: var(--auth-success)"
              >
                <app-mi-icon name="circle-check" [size]="28" />
              </div>
              <h1 class="auth-title">Cuenta lista.</h1>
              <p class="auth-subtitle leading-relaxed">
                Tu nueva contraseña quedó guardada. Ya puedes iniciar sesión en
                {{ tenantInfo.info()?.name }}.
              </p>
            </div>
            <button
              data-testid="change-password-go-login"
              type="button"
              (click)="goLogin()"
              class="auth-button auth-tap-target"
            >
              Iniciar sesión
            </button>
          </div>
        }
      }
    </app-auth-shell>
  `,
})
export class ChangePasswordComponent implements OnInit {
  readonly authService = inject(AuthService);
  readonly tenantInfo = inject(TenantInfoService);
  private readonly router = inject(Router);

  readonly screenState = signal<ScreenState>('form');
  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly roleLabel = computed(() => {
    const role = this.authService.currentUser()?.role;
    return role ? ROLE_LABEL[role] : '';
  });

  /** Estado de cada regla, derivado de la misma fuente que el validador. */
  private readonly currentPasswordValue = signal('');
  private readonly newPasswordValue = signal('');
  /** El checklist solo aparece una vez que el usuario empieza a escribir la
   *  nueva contraseña, no antes (evita mostrar requisitos "cumplidos" por
   *  vacuidad, como el de longitud máxima con el campo vacío). */
  readonly showRules = computed(() => this.newPasswordValue().length > 0);
  readonly ruleStates = computed(() => {
    const newVal = this.newPasswordValue();
    const curVal = this.currentPasswordValue();
    const reglas = PASSWORD_RULES.map((rule) => {
      const met = rule.test(newVal);
      return {
        label: rule.label,
        met,
        icon: met ? 'check' : 'circle',
        srSuffix: met ? '(cumplido)' : '(pendiente)',
      };
    });
    const distinta = newVal.length > 0 && newVal !== curVal;
    reglas.push({
      label: 'Distinta a la contraseña temporal',
      met: distinta,
      icon: distinta ? 'check' : 'circle',
      srSuffix: distinta ? '(cumplido)' : '(pendiente)',
    });
    return reglas;
  });

  readonly form = new FormGroup(
    {
      current_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      new_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, politicaYDistinta(() => this.currentPasswordValue())],
      }),
      confirm_password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    },
    { validators: passwordsMatch },
  );

  constructor() {
    this.form.controls.current_password.valueChanges.subscribe((v) =>
      this.currentPasswordValue.set(v ?? ''),
    );
    this.form.controls.new_password.valueChanges.subscribe((v) =>
      this.newPasswordValue.set(v ?? ''),
    );
  }

  async ngOnInit(): Promise<void> {
    await this.tenantInfo.load();
  }

  invalid(name: 'current_password' | 'new_password' | 'confirm_password'): boolean {
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
    this.errorMessage.set(null);

    const { current_password, new_password, confirm_password } = this.form.getRawValue();

    if (!current_password) {
      this.errorMessage.set('Escribe la contraseña temporal de tu invitación.');
      return;
    }
    if (!cumplePolitica(new_password) || new_password === current_password) {
      this.errorMessage.set('La nueva contraseña no cumple todos los requisitos.');
      return;
    }
    if (new_password !== confirm_password) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }

    this.isLoading.set(true);
    const { error } = await this.authService.changePassword(current_password, new_password);
    this.isLoading.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.form.reset();
    this.screenState.set('done');
  }

  goLogin(): void {
    const role = this.authService.currentUser()?.role ?? UserRole.ADMIN;
    this.router.navigate([ROLE_HOME[role]]);
  }
}
