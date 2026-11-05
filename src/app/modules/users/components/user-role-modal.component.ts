import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoleName, TenantUser } from '../interfaces/user-profile.interface';
import { UsersService } from '../services/users.service';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

@Component({
  selector: 'app-user-role-modal',
  standalone: true,
  imports: [ReactiveFormsModule, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-sm font-semibold text-gray-800">Cambiar rol</h2>
          <button
            type="button"
            (click)="cancelled.emit()"
            class="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <app-mi-icon name="close" ariaLabel="Cerrar" [size]="20" />
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="px-6 py-5 space-y-4">
          @if (user) {
            <div class="bg-gray-50 rounded-xl px-4 py-3">
              <p class="text-sm font-semibold text-gray-800">{{ user.name }}</p>
              <p class="text-xs text-gray-400">{{ user.email }}</p>
            </div>
          }

          @if (usersService.error()) {
            <p class="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {{ usersService.error() }}
            </p>
          }

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Rol <span class="text-red-500">*</span>
            </label>
            <select
              formControlName="role"
              class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white"
              [class.border-red-400]="roleControl.invalid && roleControl.touched"
            >
              <option value="" disabled>Selecciona un rol</option>
              <option value="ADMIN">Admin</option>
              <option value="CASHIER">Cajero</option>
              <option value="MESERO">Mesero</option>
              <option value="KITCHEN">Cocina</option>
            </select>
            @if (roleControl.invalid && roleControl.touched) {
              <p class="text-red-500 text-xs mt-1">Selecciona un rol</p>
            }
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              (click)="cancelled.emit()"
              [disabled]="usersService.isSubmitting()"
              class="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              [disabled]="usersService.isSubmitting()"
              class="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ usersService.isSubmitting() ? 'Guardando...' : 'Guardar' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class UserRoleModalComponent implements OnChanges {
  @Input() user: TenantUser | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly usersService = inject(UsersService);

  readonly form = new FormGroup({
    role: new FormControl<RoleName | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  get roleControl() {
    return this.form.controls.role;
  }

  ngOnChanges(): void {
    this.usersService.error.set(null);
    const current = this.user?.role_name?.toUpperCase();
    const role: RoleName | '' =
      current === 'ADMIN' || current === 'CASHIER' || current === 'MESERO' || current === 'KITCHEN'
        ? current
        : '';
    this.form.reset({ role });
  }

  async onSubmit(): Promise<void> {
    if (!this.user) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    await this.usersService.changeRole(this.user.id, this.roleControl.value as RoleName);

    if (!this.usersService.error()) {
      this.saved.emit();
    }
  }
}
