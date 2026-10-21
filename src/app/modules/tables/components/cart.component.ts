import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { MoneyPipe } from '../../../shared/money.pipe';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';
import { IconComponent } from '../../../shared/icon/icon.component';
import { DiningCartService } from '../services/dining-cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [MoneyPipe, IconMiComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <div class="flex items-center justify-between mb-4">
        <h2 class="font-sora text-lg font-semibold text-gray-900 tracking-tight">Mi pedido</h2>
      </div>

      <!-- Empty -->
      @if (cart.isEmpty()) {
        <div
          class="flex-1 flex flex-col items-center justify-center text-center gap-2 py-8 text-gray-400"
        >
          <span class="w-8 h-8 block"><app-icon name="shopping-cart" /></span>
          <p class="font-semibold text-gray-900">Tu pedido está vacío.</p>
          <p class="text-sm">Toca un producto para agregarlo.</p>
        </div>
      } @else {
        <div class="flex-1 overflow-y-auto divide-y divide-gray-200 mb-3">
          @for (line of cart.lines(); track line.id) {
            <div class="flex flex-col gap-2.5 py-3.5 first:pt-0">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex flex-col gap-1">
                  <p class="font-semibold text-gray-900 truncate">
                    {{ line.productName }}
                    <span class="font-normal text-gray-500">· {{ line.variantName }}</span>
                  </p>
                  @if (line.optionNames.length > 0) {
                    <p class="text-sm text-gray-500 truncate">
                      + {{ line.optionNames.join(', ') }}
                    </p>
                  }
                  @if ((line.toppingNames ?? []).length > 0) {
                    <p class="text-sm text-gray-500 truncate">
                      + {{ (line.toppingNames ?? []).join(', ') }}
                    </p>
                  }
                  @if (line.notes) {
                    <p class="text-sm text-gray-400 italic truncate">“{{ line.notes }}”</p>
                  }
                </div>
                <span class="font-sora font-semibold text-gray-900 shrink-0 tabular-nums">
                  {{ line.lineTotal | money }}
                </span>
              </div>

              <div class="flex items-center justify-between gap-3 flex-wrap">
                <!-- 44 px: el objetivo táctil mínimo cómodo con el pulgar. -->
                <!-- spec 081 (FR-004/FR-006): el paso lo decide stepFor(line) — 1 (libre) para
                     lo agregado desde una categoría normal, min_qty de la regla para lo
                     agregado desde "Promociones" (research.md D3, contrato §3). -->
                <div class="flex items-center gap-1 p-0.5 rounded-full bg-gray-50 shrink-0">
                  <button
                    (click)="
                      quantityChanged.emit({
                        itemId: line.id,
                        quantity: line.quantity - cart.stepFor(line),
                      })
                    "
                    [disabled]="cart.busy()"
                    [attr.aria-label]="
                      line.quantity === cart.stepFor(line) ? 'Quitar del pedido' : 'Quitar uno'
                    "
                    class="w-11 h-11 rounded-full bg-white hover:bg-red-50 text-gray-700 hover:text-red-600 text-xl font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
                  >
                    −
                  </button>
                  <span
                    class="w-8 text-center text-base font-semibold text-gray-900 tabular-nums"
                    >{{ line.quantity }}</span
                  >
                  <button
                    (click)="
                      quantityChanged.emit({
                        itemId: line.id,
                        quantity: line.quantity + cart.stepFor(line),
                      })
                    "
                    [disabled]="cart.busy()"
                    aria-label="Añadir uno"
                    class="w-11 h-11 rounded-full bg-violet-700 hover:bg-violet-800 text-white text-xl font-bold leading-none flex items-center justify-center transition-colors disabled:opacity-40"
                  >
                    +
                  </button>
                </div>

                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-400 tabular-nums"
                    >{{ line.unitPrice | money }} c/u</span
                  >
                  @if (line.addonsTotal > 0) {
                    <!-- spec 089 (A-94): los adicionales se cobran una vez por línea, no por unidad. -->
                    <span class="text-sm text-gray-400 tabular-nums"
                      >+ {{ line.addonsTotal | money }} adicionales</span
                    >
                  }
                  @if (canEditAddons(line)) {
                    <!-- spec 089 (Historia 3): editar/quitar los adicionales y la nota sin eliminar
                         la línea. 44 px de alto: objetivo táctil cómodo con el pulgar. -->
                    <button
                      type="button"
                      data-testid="editar-adicionales"
                      (click)="editAddons.emit(line.id)"
                      [disabled]="cart.busy()"
                      class="min-h-11 inline-flex items-center gap-1.5 px-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 rounded-lg disabled:opacity-40"
                    >
                      <app-mi-icon name="edit" [size]="14" />
                      Editar
                    </button>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Total -->
        <div class="border-t border-gray-200 pt-3 mb-3">
          <div class="flex justify-between items-baseline">
            <span class="text-xs font-semibold tracking-wide text-gray-400">TOTAL</span>
            <span class="font-sora text-xl font-bold text-gray-900 tabular-nums">{{
              cart.total() | money
            }}</span>
          </div>
        </div>
      }

      <!-- Error -->
      @if (error) {
        <div class="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <p class="text-red-600 text-sm">{{ error }}</p>
        </div>
      }

      <button
        (click)="submitOrder.emit()"
        [disabled]="cart.isEmpty() || submitting"
        class="w-full h-13 py-3 bg-violet-700 text-white text-base font-semibold rounded-2xl hover:bg-violet-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-auto"
      >
        {{ submitting ? 'Enviando...' : 'Revisar pedido' }}
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
