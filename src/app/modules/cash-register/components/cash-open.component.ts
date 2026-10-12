import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashSessionStore } from '../services/cash-session.store';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';

/** Pantalla de apertura de turno: selección de caja + fondo inicial. */
@Component({
  selector: 'app-cash-open',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MoneyInputComponent],
  template: `
    <div class="flex-1 flex items-center justify-center p-6">
      <div class="w-[420px] max-w-full bg-white rounded-2xl shadow-md border border-gray-100 p-6 space-y-4">
        <p class="text-xs uppercase tracking-wide text-indigo-600 font-semibold">Apertura de turno</p>
        <h2 class="text-2xl font-bold text-gray-900">Abrir caja</h2>
        <p class="text-sm text-gray-500">
          Selecciona la caja e ingresa el fondo inicial en efectivo para comenzar el turno.
          Esta operación queda auditada con fecha, hora, caja y cajero.
        </p>
        <div class="border-t border-gray-100"></div>

        @if (store.error()) {
          <div class="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{{ store.error() }}</div>
        }

        @if (store.registers().length === 0) {
          <!-- Sin cajas registradas -->
          @if (store.isAdmin()) {
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p class="text-sm text-amber-800">No hay cajas registradas. Crea una para empezar.</p>
              <div class="flex gap-2">
                <input
                  type="text"
                  [value]="store.newRegisterName()"
                  (input)="store.newRegisterName.set($any($event.target).value)"
                  placeholder="Nombre de la caja (ej: Caja 1)"
                  class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button
                  (click)="store.createRegister()"
                  [disabled]="store.isSubmitting() || !store.newRegisterName().trim()"
                  class="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  Crear caja
                </button>
              </div>
            </div>
          } @else {
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              No hay cajas registradas. Pídele a un administrador que cree una caja.
            </div>
          }
        } @else {
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Caja</label>
            <select
              [value]="store.selectedRegisterId()"
              (change)="store.selectedRegisterId.set($any($event.target).value)"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">Selecciona una caja…</option>
              @for (r of store.registers(); track r.id) {
                <option [value]="r.id">{{ r.name }}</option>
              }
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Cajero</label>
            <input
              type="text"
              [value]="store.cajero()"
              disabled
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Fondo inicial (base de efectivo)</label>
            <app-money-input
              [ngModel]="store.openingAmount()"
              (ngModelChange)="store.openingAmount.set($event ?? 0)"
              [invalid]="store.openingAmount() <= 0"
              sizeClass="px-3 py-2 rounded-lg text-sm"
            />
            @if (store.openingAmount() <= 0) {
              <p class="text-red-500 text-xs mt-1">El saldo inicial debe ser mayor a cero para abrir la caja</p>
            }
          </div>

          <button
            (click)="store.abrirCaja()"
            [disabled]="store.aperturaDisabled()"
            class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {{ store.isSubmitting() ? 'Abriendo…' : 'Abrir caja y comenzar turno' }}
          </button>
        }
      </div>
    </div>
  `,
})
export class CashOpenComponent {
  readonly store = inject(CashSessionStore);
}
