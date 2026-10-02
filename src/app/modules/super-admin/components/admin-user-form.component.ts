import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { UserRole } from '../../../core/interfaces/user.interface';
import { AdminUser, AdminUserForm } from '../interfaces/admin-user.interface';
import { SuperAdminUsersService } from '../services/super-admin-users.service';
import { TenantService } from '../services/tenant.service';
import { PasswordInputComponent } from '../../../shared/password-input/password-input.component';
import { fullNameValidator, normalizeFullName } from '../../../shared/validators/full-name.validator';

/** Tenant roles the super admin can assign (creating super admins is out of scope). */
const ASSIGNABLE_ROLES: { value: UserRole; label: string }[] = [
  { value: UserRole.ADMIN, label: 'Administrador' },
  { value: UserRole.CASHIER, label: 'Cajero' },
];

@Component({
  selector: 'app-admin-user-form',
  standalone: true,
  imports: [ReactiveFormsModule, PasswordInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ user ? 'Editar usuario' : 'Nuevo usuario' }}
          </h2>
          <button
            type="button"
            (click)="onCancel()"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
          <!-- Email -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Email <span class="text-red-500">*</span>
            </label>
            <input
              type="email"
              formControlName="email"
              placeholder="usuario@negocio.com"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-500"
              [class.border-red-400]="emailControl.invalid && emailControl.touched"
              [class.border-gray-200]="!(emailControl.invalid && emailControl.touched)"
            />
            @if (emailControl.touched && emailControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El email es requerido</p>
            }
            @if (emailControl.touched && emailControl.errors?.['email']) {
              <p class="text-red-500 text-xs mt-1">Email inválido</p>
            }
          </div>

          <!-- Password (only on create) -->
          @if (!user) {
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Contraseña <span class="text-red-500">*</span>
              </label>
              <app-password-input
                formControlName="password"
                placeholder="Mínimo 6 caracteres"
                autocomplete="new-password"
                sizeClass="px-3 py-2 rounded-lg text-sm"
                [invalid]="passwordControl.invalid && passwordControl.touched"
              />
              @if (passwordControl.touched && passwordControl.errors?.['required']) {
                <p class="text-red-500 text-xs mt-1">La contraseña es requerida</p>
              }
              @if (passwordControl.touched && passwordControl.errors?.['minlength']) {
                <p class="text-red-500 text-xs mt-1">Mínimo 6 caracteres</p>
              }
            </div>
          }

          <!-- Name: obligatorio al crear; al editar, opcional pero válido si se escribe (spec 091) -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Nombre completo
              @if (user) {
                <span class="text-gray-400 font-normal">(opcional)</span>
              } @else {
                <span class="text-red-500">*</span>
              }
            </label>
            <input
              type="text"
              formControlName="name"
              placeholder="Nombre completo"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="nameControl.invalid && nameControl.touched"
              [class.border-gray-200]="!(nameControl.invalid && nameControl.touched)"
            />
            @if (nameControl.touched && nameControl.errors?.['fullName']) {
              <p class="text-red-500 text-xs mt-1">{{ nameControl.errors?.['fullName'].message }}</p>
            }
          </div>

          <!-- Role -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Rol <span class="text-red-500">*</span>
            </label>
            <select
              formControlName="role"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              [class.border-red-400]="roleControl.invalid && roleControl.touched"
              [class.border-gray-200]="!(roleControl.invalid && roleControl.touched)"
            >
              <option [ngValue]="''" disabled>Selecciona un rol</option>
              @for (r of roles; track r.value) {
                <option [ngValue]="r.value">{{ r.label }}</option>
              }
            </select>
            @if (roleControl.touched && roleControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El rol es requerido</p>
            }
          </div>

          <!-- Tenant -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Tenant <span class="text-red-500">*</span>
            </label>
            <select
              formControlName="tenant_id"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              [class.border-red-400]="tenantControl.invalid && tenantControl.touched"
              [class.border-gray-200]="!(tenantControl.invalid && tenantControl.touched)"
            >
              <option [ngValue]="null" disabled>Selecciona un tenant</option>
              @for (t of tenantService.tenants(); track t.id) {
                <option [ngValue]="t.id">{{ t.name }}</option>
              }
            </select>
            @if (tenantControl.touched && tenantControl.errors?.['required']) {
              <p class="text-red-500 text-xs mt-1">El tenant es requerido</p>
            }
          </div>

          <!-- Service error -->
          @if (usersService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ usersService.error() }}
            </p>
          }

          <!-- Actions -->
          <div class="flex gap-3 pt-2">
            <button
              type="button"
              (click)="onCancel()"
              class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="usersService.isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ usersService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class AdminUserFormComponent implements OnInit, OnChanges {
  @Input() user: AdminUser | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly usersService = inject(SuperAdminUsersService);
  readonly tenantService = inject(TenantService);
  readonly roles = ASSIGNABLE_ROLES;

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
    name: new FormControl('', { nonNullable: true, validators: [fullNameValidator()] }),
    role: new FormControl<UserRole | ''>('', { nonNullable: true, validators: [Validators.required] }),
    tenant_id: new FormControl<number | null>(null, { validators: [Validators.required] }),
  });

  get emailControl(): AbstractControl {
    return this.form.controls.email;
  }
  get nameControl(): AbstractControl {
    return this.form.controls.name;
  }
  get passwordControl(): AbstractControl {
    return this.form.controls.password;
  }
  get roleControl(): AbstractControl {
    return this.form.controls.role;
  }
  get tenantControl(): AbstractControl {
    return this.form.controls.tenant_id;
  }

  ngOnInit(): void {
    // Ensure the tenant selector has options even when opened directly.
    if (this.tenantService.tenants().length === 0) {
      this.tenantService.loadTenants();
    }
  }

  ngOnChanges(): void {
    this.usersService.error.set(null);
    if (this.user) {
      // Editing: email immutable, password not required.
      this.form.reset();
      this.form.patchValue({
        email: this.user.email,
        name: this.user.name ?? '',
        role: this.user.role,
        tenant_id: this.user.tenant_id,
      });
      this.emailControl.disable();
      this.nameControl.setValidators([fullNameValidator({ optional: true })]);
      this.nameControl.updateValueAndValidity();
      this.passwordControl.clearValidators();
      this.passwordControl.updateValueAndValidity();
    } else {
      this.form.reset({ email: '', password: '', name: '', role: '', tenant_id: null });
      this.emailControl.enable();
      this.nameControl.setValidators([fullNameValidator()]);
      this.nameControl.updateValueAndValidity();
      this.passwordControl.setValidators([Validators.required, Validators.minLength(6)]);
      this.passwordControl.updateValueAndValidity();
    }
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    const data: AdminUserForm = {
      email: raw.email.trim(),
      password: raw.password,
      // Normalizado (recorte + NFC) cuando se escribió; vacío al editar sin nombre propio.
      name: raw.name.trim() === '' ? '' : (normalizeFullName(raw.name) as { value: string }).value,
      role: raw.role as UserRole,
      tenant_id: raw.tenant_id,
    };

    if (this.user) {
      await this.usersService.updateUser(this.user.id, data);
    } else {
      await this.usersService.createUser(data);
    }

    if (!this.usersService.error()) {
      this.saved.emit();
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
