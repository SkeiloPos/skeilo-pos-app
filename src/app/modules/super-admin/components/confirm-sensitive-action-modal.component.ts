import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/** Modal de confirmación de alta fricción (spec 159, User Story 5, FR-025):
 * exige escribir el correo EXACTO del usuario antes de habilitar la acción
 * irreversible. Genérico -- lo usan "anonimizar" y "eliminar permanentemente",
 * cada uno con su propio título/mensaje/color de botón. */
@Component({
  selector: 'app-confirm-sensitive-action-modal',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">{{ title }}</h2>
          <button type="button" (click)="onCancel()" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div class="px-6 py-5 space-y-4">
          <p class="text-sm text-gray-600">{{ message }}</p>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Escribe <span class="font-mono text-gray-900">{{ userEmail }}</span> para confirmar
            </label>
            <input
              type="text"
              data-testid="confirm-email-input"
              [(ngModel)]="typedEmail"
              placeholder="correo@negocio.com"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="touched && !isMatch()"
              [class.border-gray-200]="!(touched && !isMatch())"
            />
            @if (touched && !isMatch()) {
              <p data-testid="confirm-email-error" class="text-red-500 text-xs mt-1">
                El correo no coincide.
              </p>
            }
          </div>

          <div class="flex gap-3 pt-2">
            <button
              type="button"
              (click)="onCancel()"
              class="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="confirm-sensitive-action"
              (click)="onConfirm()"
              class="flex-1 px-4 py-2 text-white rounded-lg text-sm font-medium"
              [class]="confirmButtonClass"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmSensitiveActionModalComponent {
  @Input({ required: true }) userEmail = '';
  @Input() title = 'Confirmar acción';
  @Input() message = '';
  @Input() confirmLabel = 'Confirmar';
  @Input() confirmButtonClass = 'bg-red-600 hover:bg-red-700';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  typedEmail = '';
  touched = false;

  isMatch(): boolean {
    return this.typedEmail === this.userEmail;
  }

  onConfirm(): void {
    this.touched = true;
    if (!this.isMatch()) return;
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
