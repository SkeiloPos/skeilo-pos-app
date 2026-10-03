import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { ProductSelectComponent } from './product-select.component';
import { effectivePrice } from '../../promotions/services/promotion-pricing.util';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Catálogo del "+ Agregar producto": buscador por nombre + categorías + grid de
 * productos. Reutiliza `ProductSelectComponent` para configurar
 * variante/opciones/notas/cantidad. spec 063 (FR-024): el flujo de combos se
 * retira.
 *
 * Spec 036 (FR-006/FR-007): antes se mostraba como overlay de pantalla
 * completa (`fixed inset-0 bg-black/40`); ahora se embebe dentro del panel
 * central (`pos-order-panel.component.ts`), alternando con la lista de
 * ítems del pedido — por eso ya no tiene su propio fondo/backdrop ni ancho
 * máximo, ocupa el espacio que le da su contenedor.
 */
@Component({
  selector: 'app-pos-catalog-drawer',
  standalone: true,
  imports: [DecimalPipe, ProductSelectComponent, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <h3 class="text-base font-bold text-gray-900">Catálogo de productos</h3>
        <button (click)="store.closeCatalog()" class="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">← Volver a la lista</button>
      </div>

      <div class="px-4 py-3 border-b border-gray-100 shrink-0 space-y-2">
        <input
          type="text"
          [value]="store.catalogSearchText()"
          (input)="store.setCatalogSearchText($any($event.target).value)"
          placeholder="Buscar producto por nombre…"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div class="flex gap-2 flex-wrap">
          @for (c of store.categories(); track c.id) {
            <button
              (click)="store.setCatalogCategory(c.id)"
              class="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors"
              [class]="store.catalogCategoryId() === c.id ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'"
            >
              {{ c.name }}
            </button>
          }
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        @if (store.catalogProductsFiltered().length === 0) {
          <!-- FR-007, edge case: estado vacío claro, tanto por búsqueda como
               por categoría sin coincidencias. -->
          <p class="text-center text-sm text-gray-400 py-10">
            @if (store.catalogSearchText()) {
              Sin productos que coincidan con "{{ store.catalogSearchText() }}".
            } @else {
              Sin productos en esta categoría.
            }
          </p>
        } @else {
          <div class="grid grid-cols-2 gap-3">
            @for (p of store.catalogProductsFiltered(); track p.id) {
              <button
                (click)="store.openConfig(p)"
                [disabled]="p.sold_out"
                class="relative text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200"
              >
                @if (p.sold_out) {
                  <!-- spec 093 (escenario 5): sigue visible, atenuado, sin poder agregarse. -->
                  <span class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                    Agotado
                  </span>
                } @else if (store.cardPromotionText(p.variants); as promo) {
                  <!-- spec 073, FR-016: condición legible del backend (spec 066), no la insignia local. -->
                  <span class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 inline-flex items-center gap-1">
                    <app-mi-icon name="sell" [size]="10" />
                    {{ promo }}
                  </span>
                }
                <div class="font-semibold text-gray-900 text-sm">{{ p.name }}</div>
                <div class="text-sm font-bold text-gray-900 mt-1">
                  Desde $ {{ minPrice(p) | number: '1.0-0' }}
                </div>
              </button>
            }
          </div>
        }
      </div>
    </div>

    @if (store.configuringProduct(); as product) {
      <app-product-select
        [product]="product"
        (added)="store.addDraftFromSelection($event)"
        (cancelled)="store.closeConfig()"
      />
    }
  `,
})
export class PosCatalogDrawerComponent {
  readonly store = inject(PosTerminalStore);

  minPrice(p: { variants: { price: number; discounted_price?: number | null }[] }): number {
    return p.variants.length
      ? Math.min(...p.variants.map((v) => effectivePrice(v.price, v.discounted_price)))
      : 0;
  }
}
