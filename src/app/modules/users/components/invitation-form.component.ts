import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RoleName, InvitationForm } from '../interfaces/user-profile.interface';
import { InvitationsService } from '../services/invitations.service';
import { fullNameValidator } from '../../../shared/validators/full-name.validator';

@Component({
  selector: 'app-invitation-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="px-5 py-4 border-b border-gray-100">
        <h2 class="text-sm font-semibold text-gray-800">Invitar usuario</h2>
        <p class="text-xs text-gray-400 mt-0.5">
          Enviamos un correo con el enlace de acceso y una contraseña temporal — nadie más la conoce.
        </p>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="px-5 py-4 space-y-4">
        @if (invitationsService.error()) {
          <div class="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {{ invitationsService.error() }}
          </div>
        }

        <!-- Nombre completo (spec 091): primero, antes de correo y rol -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Nombre completo</label>
          <input
            type="text"
            formControlName="name"
            placeholder="María Pérez"
            autocomplete="off"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            [class.border-red-300]="nameInvalid"
          />
          @if (nameInvalid) {
            <p class="text-red-500 text-xs mt-1">{{ nameError }}</p>
          }
        </div>

        <!-- Email -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Correo electrónico</label>
          <input
            type="email"
            formControlName="email"
            placeholder="usuario@heladeria.com"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
            [class.border-red-300]="emailInvalid"
          />
          @if (emailInvalid) {
            <p class="text-red-500 text-xs mt-1">Ingresa un correo válido</p>
          }
        </div>

        <!-- Rol -->
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1.5">Rol</label>
          <select
            formControlName="role"
            class="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition bg-white"
            [class.border-red-300]="roleInvalid"
          >
            <option value="" disabled>Selecciona un rol</option>
            <option value="ADMIN">Admin</option>
            <option value="CASHIER">Cajero</option>
            <option value="MESERO">Mesero</option>
          </select>
          @if (roleInvalid) {
            <p class="text-red-500 text-xs mt-1">Selecciona un rol</p>
          }
        </div>

        <!-- Botones -->
        <div class="flex gap-3 pt-2">
          <button
            type="submit"
            [disabled]="invitationsService.isSubmitting()"
            class="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {{ invitationsService.isSubmitting() ? 'Enviando...' : 'Enviar invitación' }}
          </button>
          <button
            type="button"
            (click)="onCancel()"
            [disabled]="invitationsService.isSubmitting()"
            class="flex-1 py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  `,
})
export class InvitationFormComponent implements OnInit {
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  readonly invitationsService = inject(InvitationsService);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [fullNameValidator()] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    role: new FormControl<RoleName | ''>('', { nonNullable: true, validators: [Validators.required] }),
  });

  get nameInvalid(): boolean {
    const c = this.form.controls.name;
    return c.invalid && c.touched;
  }
  get nameError(): string {
    return this.form.controls.name.errors?.['fullName']?.message ?? '';
  }
  get emailInvalid(): boolean {
    const c = this.form.controls.email;
    return c.invalid && c.touched;
  }
  get roleInvalid(): boolean {
    const c = this.form.controls.role;
    return c.invalid && c.touched;
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const saved = await this.invitationsService.createInvitation(this.form.getRawValue() as InvitationForm);

    if (saved) {
      this.form.reset();
      this.saved.emit();
    }
  }

  /** El error vive en un servicio singleton: sin limpiarlo, sobreviviría a cerrar y reabrir (FR-023). */
  ngOnInit(): void {
    this.invitationsService.error.set(null);
  }

  onCancel(): void {
    this.form.reset();
    this.invitationsService.error.set(null);
    this.cancelled.emit();
  }
}
