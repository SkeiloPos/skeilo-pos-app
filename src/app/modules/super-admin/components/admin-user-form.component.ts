import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { UserDetail, UserUpdatePayload } from '../interfaces/admin-user.interface';
import { SuperAdminUsersService } from '../services/super-admin-users.service';
import { SuperAdminUserDetailService } from '../services/super-admin-user-detail.service';
import { TenantService } from '../services/tenant.service';
import { Tenant } from '../interfaces/tenant.interface';
import { ConfirmService } from '../../../shared/feedback/confirm.service';
import { fullNameValidator, normalizeFullName } from '../../../shared/validators/full-name.validator';

/** Edita nombre, rol y/o negocio asociado de un usuario ya existente (spec
 * 159, User Story 4, FR-016/FR-017). La creación directa de usuarios no es
 * parte de este módulo (se hace al crear un tenant, o por invitación). */
@Component({
  selector: 'app-admin-user-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">Editar usuario</h2>
          <button
            type="button"
            (click)="onCancel()"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate class="px-6 py-5 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Correo</label>
            <input
              type="email"
              [value]="user?.email"
              disabled
              class="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-lg text-sm"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
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

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select
              formControlName="role_id"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option [ngValue]="''">Sin cambios</option>
              @for (r of usersService.roles(); track r.id) {
                <option [ngValue]="r.id">{{ r.name }}</option>
              }
            </select>
          </div>

          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Negocio asociado (opcional)
            </p>
            <div class="grid grid-cols-2 gap-3">
              <select
                data-testid="membership-tenant"
                formControlName="membership_tenant_id"
                class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option [ngValue]="''">Sin cambios</option>
                @for (t of tenants(); track t.id) {
                  <option [ngValue]="t.id">{{ t.name }}</option>
                }
              </select>
              <select
                data-testid="membership-role"
                formControlName="membership_role_id"
                class="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option [ngValue]="''">Rol en ese negocio</option>
                @for (r of usersService.roles(); track r.id) {
                  <option [ngValue]="r.id">{{ r.name }}</option>
                }
              </select>
            </div>
            @if (membershipError()) {
              <p class="text-red-500 text-xs mt-1">{{ membershipError() }}</p>
            }
          </div>

          @if (error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ error() }}
            </p>
          }

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
              [disabled]="isSubmitting()"
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class AdminUserFormComponent implements OnInit, OnChanges {
  @Input() user: UserDetail | null = null;
  @Output() saved = new EventEmitter<UserDetail>();
  @Output() cancelled = new EventEmitter<void>();

  readonly usersService = inject(SuperAdminUsersService);
  private readonly detailService = inject(SuperAdminUserDetailService);
  private readonly tenantService = inject(TenantService);
  private readonly confirm = inject(ConfirmService);

  readonly tenants = signal<Tenant[]>([]);
  readonly error = signal<string | null>(null);
  readonly isSubmitting = signal(false);
  readonly membershipError = signal<string | null>(null);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [fullNameValidator({ optional: true })] }),
    role_id: new FormControl<string>('', { nonNullable: true }),
    membership_tenant_id: new FormControl<number | ''>('', { nonNullable: true }),
    membership_role_id: new FormControl<string>('', { nonNullable: true }),
  });

  get nameControl(): AbstractControl {
    return this.form.controls.name;
  }

  ngOnInit(): void {
    if (this.usersService.roles().length === 0) {
      void this.usersService.loadRoles();
    }
    this.tenantService.loadTenants().subscribe({
      next: response => this.tenants.set(response.items),
      error: () => undefined,
    });
  }

  ngOnChanges(): void {
    this.error.set(null);
    this.membershipError.set(null);
    this.form.reset({
      name: this.user?.name ?? '',
      role_id: '',
      membership_tenant_id: '',
      membership_role_id: '',
    });
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    this.membershipError.set(null);
    if (this.form.invalid || !this.user) return;

    const raw = this.form.getRawValue();
    const hasTenant = raw.membership_tenant_id !== '';
    const hasRole = raw.membership_role_id !== '';
    if (hasTenant !== hasRole) {
      this.membershipError.set('Elige el negocio y el rol en ese negocio juntos.');
      return;
    }

    const name = raw.name.trim() === '' ? undefined : (normalizeFullName(raw.name) as { value: string }).value;
    const payload: UserUpdatePayload = {
      ...(name !== undefined && name !== this.user.name ? { name } : {}),
      ...(raw.role_id ? { role_id: raw.role_id } : {}),
      ...(hasTenant ? { membership_tenant_id: raw.membership_tenant_id as number } : {}),
      ...(hasRole ? { membership_role_id: raw.membership_role_id } : {}),
    };

    if (Object.keys(payload).length === 0) {
      this.cancelled.emit();
      return;
    }

    const ok = await this.confirm.ask({
      title: 'Confirmar cambios',
      message: '¿Confirmas que quieres guardar estos cambios en el usuario?',
      confirmText: 'Guardar',
    });
    if (!ok) return;

    this.isSubmitting.set(true);
    this.error.set(null);
    try {
      const updated = await this.detailService.updateUser(this.user.id, payload);
      this.usersService.refreshListAndStats();
      this.saved.emit(updated);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string } | null;
      return body?.detail ?? 'No se pudo guardar el usuario.';
    }
    return 'No se pudo guardar el usuario.';
  }
}
