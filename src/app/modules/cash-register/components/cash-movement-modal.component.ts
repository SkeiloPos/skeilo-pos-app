import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CashSessionStore } from '../services/cash-session.store';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Modal para registrar un movimiento manual (ingreso / egreso / retiro).
 * Cierra solo con el botón de cerrar o Cancelar, no al hacer clic en el fondo.
 */
@Component({
  selector: 'app-cash-movement-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MoneyInputComponent, IconMiComponent],
  template: `
    <div class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="text-base font-bold text-gray-900">{{ store.modalTitulo() }}</h2>
          <button type="button" (click)="store.closeModal()" class="text-gray-400 hover:text-gray-600 transition-colors">
            <app-mi-icon name="close" ariaLabel="Cerrar" [size]="20" />
          </button>
        </div>

        <div class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              [value]="store.formCategoria()"
              (change)="store.formCategoria.set($any($event.target).value)"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              @for (c of store.categoriasModal(); track c) {
                <option [value]="c">{{ c }}</option>
              }
            </select>
          </div>

          @if (store.esIngreso()) {
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Método de pago</label>
              <select
                [value]="store.formPaymentMethodId()"
                (change)="store.formPaymentMethodId.set($any($event.target).value)"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Selecciona…</option>
                @for (m of store.metodosLinea1(); track m.id) {
                  <option [value]="m.id">{{ m.name }}</option>
                }
              </select>
            </div>
          }

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Valor</label>
            <app-money-input
              [ngModel]="store.formMonto() ? +store.formMonto() : null"
              (ngModelChange)="store.formMonto.set($event === null ? '' : $event.toString())"
            />
          </div>

          @if (store.esIngreso() && store.formSegundaLinea()) {
            <div class="border-t border-gray-100 pt-3 space-y-2">
              <div class="flex items-center justify-between">
                <label class="block text-sm font-medium text-gray-700">Segundo método de pago</label>
                <button type="button" (click)="store.quitarSegundoMetodo()" class="text-sm font-medium text-red-600">
                  Quitar
                </button>
              </div>
              <select
                [value]="store.formSegundoMetodo()"
                (change)="store.formSegundoMetodo.set($any($event.target).value)"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="">Selecciona…</option>
                @for (m of store.metodosLinea2(); track m.id) {
                  <option [value]="m.id">{{ m.name }}</option>
                }
              </select>
              <app-money-input
                [ngModel]="store.formSegundoMonto() ? +store.formSegundoMonto() : null"
                (ngModelChange)="store.formSegundoMonto.set($event === null ? '' : $event.toString())"
              />
            </div>
          }

          @if (store.puedeAgregarSegundoMetodo()) {
            <button
              type="button"
              (click)="store.agregarSegundoMetodo()"
              class="w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm font-semibold text-gray-600"
            >
              Agregar otro método
            </button>
          }

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Observación (opcional)</label>
            <input
              type="text"
              [value]="store.formNota()"
              (input)="store.formNota.set($any($event.target).value)"
              placeholder="Detalle del movimiento"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          @if (store.error()) {
            <p class="text-sm text-red-600">{{ store.error() }}</p>
          }

          <div class="flex gap-3 pt-2">
            <button type="button" (click)="store.closeModal()" [disabled]="store.isSubmitting()"
              class="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors">
              Cancelar
            </button>
            <button type="button" (click)="store.confirmarMovimiento()" [disabled]="store.movimientoDisabled() || store.isSubmitting()"
              class="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 transition-colors">
              {{ store.isSubmitting() ? 'Registrando…' : 'Registrar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CashMovementModalComponent {
  readonly store = inject(CashSessionStore);
}
