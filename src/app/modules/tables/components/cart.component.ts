import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { MoneyPipe } from '../../../shared/money.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { DiningCartService } from '../services/dining-cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [MoneyPipe, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-base font-bold text-gray-900">Mi pedido</h2>
      </div>

      <!-- Empty -->
      @if (cart.isEmpty()) {
        <div class="flex-1 flex flex-col items-center justify-center text-center py-6">
          <div class="text-4xl mb-2">🛒</div>
          <p class="text-sm text-gray-400">Aún no has agregado nada</p>
        </div>
      } @else {
        <div class="flex-1 overflow-y-auto space-y-3 mb-3">
          @for (line of cart.lines(); track line.id) {
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-800 truncate">
                  {{ line.productName }} · {{ line.variantName }}
                </p>
                @if (line.optionNames.length > 0) {
                  <p class="text-xs text-gray-400 truncate">
                    {{ line.optionNames.join(', ') }}
                  </p>
                }
                @if (line.notes) {
                  <p class="text-xs text-gray-400 italic truncate">“{{ line.notes }}”</p>
                }
                @if (canEditAddons(line)) {
                  <!-- spec 089 (Historia 3): editar/quitar los adicionales y la nota sin eliminar
                       la línea. 44 px de alto: objetivo táctil cómodo con el pulgar. -->
                  <button
                    type="button"
                    data-testid="editar-adicionales"
                    (click)="editAddons.emit(line.id)"
                    [disabled]="cart.busy()"
                    class="mt-1 min-h-11 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
                  >
                    <app-mi-icon name="edit" [size]="14" />
                    Editar adicionales
                  </button>
                }
                <p class="text-xs text-gray-400">{{ line.unitPrice | money }} c/u</p>
                @if (line.addonsTotal > 0) {
                  <!-- spec 089 (A-94): los adicionales se cobran una vez por línea, no por unidad. -->
                  <p class="text-xs text-gray-400">+ {{ line.addonsTotal | money }} adicionales</p>
                }
              </div>
              <!-- 44 px: el objetivo táctil mínimo cómodo con el pulgar. -->
              <!-- spec 081 (FR-004/FR-006): el paso lo decide stepFor(line) — 1 (libre) para
                   lo agregado desde una categoría normal, min_qty de la regla para lo
                   agregado desde "Promociones" (research.md D3, contrato §3). -->
              <div class="flex items-center gap-1 shrink-0">
                <button
                  (click)="quantityChanged.emit({ itemId: line.id, quantity: line.quantity - cart.stepFor(line) })"
                  [disabled]="cart.busy()"
                  [attr.aria-label]="line.quantity === cart.stepFor(line) ? 'Quitar del pedido' : 'Quitar uno'"
                  class="w-11 h-11 rounded-full bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 text-xl font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  −
                </button>
                <span class="w-8 text-center text-base font-semibold text-gray-900">{{ line.quantity }}</span>
                <button
                  (click)="quantityChanged.emit({ itemId: line.id, quantity: line.quantity + cart.stepFor(line) })"
                  [disabled]="cart.busy()"
                  aria-label="Añadir uno"
                  class="w-11 h-11 rounded-full bg-gray-100 hover:bg-indigo-100 text-gray-600 hover:text-indigo-600 text-xl font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <span class="text-sm font-semibold text-indigo-600 w-16 text-right shrink-0">
                {{ line.lineTotal | money }}
              </span>
            </div>
          }
        </div>

        <!-- Total -->
        <div class="border-t border-gray-100 pt-3 mb-3">
          <div class="flex justify-between items-center">
            <span class="text-sm font-semibold text-gray-700">Total</span>
            <span class="text-base font-bold text-gray-900">{{ cart.total() | money }}</span>
          </div>
        </div>
      }

      <!-- Error -->
      @if (error) {
        <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <p class="text-red-600 text-xs">{{ error }}</p>
        </div>
      }

      <button
        (click)="submitOrder.emit()"
        [disabled]="cart.isEmpty() || submitting"
        class="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-auto"
      >
        {{ submitting ? 'Enviando...' : 'Enviar pedido' }}
      </button>
    </div>
  `,
})
export class CartComponent {
  @Input() submitting = false;
  @Input() error: string | null = null;
  @Output() submitOrder = new EventEmitter<void>();
  /** El carrito vive en el backend: la mutación la hace el padre y puede fallar. */
  @Output() quantityChanged = new EventEmitter<{ itemId: string; quantity: number }>();
  /**
   * spec 089 (Historia 3): el comensal pidió editar los adicionales de una línea (emite su id). El
   * padre abre el selector con la selección precargada. No se ofrece para una línea cuyo producto o
   * presentación ya no está en el menú (`editable` la resuelve el padre): solo se puede quitar.
   */
  @Output() editAddons = new EventEmitter<string>();
  /** Ids de línea que NO se pueden editar (producto/presentación desactivados). */
  @Input() nonEditableLineIds: ReadonlySet<string> = new Set();

  canEditAddons(line: { id: string }): boolean {
    return !this.nonEditableLineIds.has(line.id);
  }

  readonly cart = inject(DiningCartService);
}
