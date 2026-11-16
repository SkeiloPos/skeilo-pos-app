import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SuspendUserPayload } from '../interfaces/admin-user.interface';

/** Modal de suspensión (spec 159, User Story 4, FR-019/FR-025): exige un
 * motivo no vacío antes de poder confirmar, con una casilla opcional para
 * cerrar las sesiones activas como parte de la misma acción. */
@Component({
  selector: 'app-suspend-user-modal',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 class="text-lg font-semibold text-gray-900">Suspender usuario</h2>
          <button type="button" (click)="onCancel()" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div class="px-6 py-5 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Motivo de la suspensión <span class="text-red-500">*</span>
            </label>
            <textarea
              data-testid="suspend-reason"
              [(ngModel)]="reason"
              rows="3"
              placeholder="Describe el motivo de la suspensión"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              [class.border-red-400]="touched && !reason.trim()"
              [class.border-gray-200]="!(touched && !reason.trim())"
            ></textarea>
            @if (touched && !reason.trim()) {
              <p data-testid="suspend-reason-error" class="text-red-500 text-xs mt-1">
                Debes indicar un motivo de suspensión.
              </p>
            }
          </div>

          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" data-testid="revoke-sessions-checkbox" [(ngModel)]="revokeSessions" />
            Cerrar sus sesiones activas
          </label>

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
              data-testid="confirm-suspend"
              (click)="onConfirm()"
              class="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Suspender
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SuspendUserModalComponent {
  @Output() confirmed = new EventEmitter<SuspendUserPayload>();
  @Output() cancelled = new EventEmitter<void>();

  reason = '';
  revokeSessions = false;
  touched = false;

  onConfirm(): void {
    this.touched = true;
    if (!this.reason.trim()) return;
    this.confirmed.emit({ reason: this.reason.trim(), revoke_sessions: this.revokeSessions });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
