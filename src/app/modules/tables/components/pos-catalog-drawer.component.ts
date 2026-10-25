import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { ProductSelectComponent } from './product-select.component';
import { effectivePrice } from '../../promotions/services/promotion-pricing.util';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

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
  imports: [DecimalPipe, ProductSelectComponent, IconLucideComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex items-center justify-between px-4 py-3 border-b shrink-0" style="border-color:var(--terminal-color-border)">
        <h3 style="font-family:Sora,ui-sans-serif,system-ui,sans-serif;font-size:16px;font-weight:700;color:var(--terminal-color-text-primary)">Catálogo de productos</h3>
        <button
          (click)="store.closeCatalog()"
          class="h-9 px-3 text-[13px] font-semibold border rounded-[8px] flex items-center gap-1.5 transition-colors"
          style="border-color:var(--terminal-color-border-strong);color:var(--terminal-color-text-secondary);background:var(--terminal-color-surface)"
        >
          <app-lucide-icon name="arrow-left" [size]="14" />
          Volver a la lista
        </button>
      </div>

      <div class="px-4 py-3 border-b shrink-0 space-y-2" style="border-color:var(--terminal-color-border)">
        <input
          type="text"
          [value]="store.catalogSearchText()"
          (input)="store.setCatalogSearchText($any($event.target).value)"
          placeholder="Buscar producto por nombre…"
          class="w-full h-9 px-3 border rounded-[8px] text-[13px] focus:outline-none"
          style="border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-primary)"
        />
        <div class="flex gap-2 flex-wrap">
          <!-- spec 115 (FR-001/FR-014): sin equivalente a "Todos" -- la
               alternativa a "Promociones" aquí es simplemente tener una
               categoría seleccionada. -->
          <button
            (click)="selectPromotions()"
            class="h-9 px-3 text-[13px] font-semibold rounded-full border transition-colors"
            [style]="
              showingPromotions()
                ? 'border-color:var(--terminal-color-primary);background:var(--terminal-color-primary);color:#fff'
                : 'border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-secondary)'
            "
          >
            Promociones
          </button>
          @for (c of store.categories(); track c.id) {
            <button
              (click)="selectCategory(c.id)"
              class="h-9 px-3 text-[13px] font-semibold rounded-full border transition-colors"
              [style]="
                !showingPromotions() && store.catalogCategoryId() === c.id
                  ? 'border-color:var(--terminal-color-primary);background:var(--terminal-color-primary);color:#fff'
                  : 'border-color:var(--terminal-color-border-strong);background:var(--terminal-color-surface);color:var(--terminal-color-text-secondary)'
              "
            >
              {{ c.name }}
            </button>
          }
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        @if (catalogProducts().length === 0) {
          <!-- FR-007/FR-012, edge case: estado vacío claro, tanto por
               búsqueda como por categoría sin coincidencias o sin
               promociones vigentes. -->
          <p class="text-center text-[13px] py-10" style="color:var(--terminal-color-text-muted)">
            <span [textContent]="emptyMessage()"></span>
          </p>
        } @else {
          <div class="grid grid-cols-2 gap-3">
            @for (p of catalogProducts(); track p.id) {
              <button
                (click)="store.openConfig(p, showingPromotions())"
                [disabled]="p.sold_out"
                class="relative text-left rounded-[12px] border p-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style="background:var(--terminal-color-surface);border-color:var(--terminal-color-border)"
              >
                @if (p.sold_out) {
                  <!-- spec 093 (escenario 5): sigue visible, atenuado, sin poder agregarse. -->
                  <span
                    class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style="background:var(--terminal-color-error-soft);color:var(--terminal-color-error)"
                  >
                    Agotado
                  </span>
                } @else if (store.cardPromotionText(p.variants); as promo) {
                  <!-- spec 073, FR-016: condición legible del backend (spec 066), no la insignia local. -->
                  <span
                    class="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                    style="background:var(--terminal-color-primary-soft);color:var(--terminal-color-primary-text)"
                  >
                    <app-lucide-icon name="percent" [size]="10" />
                    {{ promo }}
                  </span>
                }
                <div class="text-[13px] font-semibold" style="color:var(--terminal-color-text-primary)">{{ p.name }}</div>
                <div class="text-[13px] font-bold mt-1" style="color:var(--terminal-color-text-primary)">
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
        [fromPromotions]="store.configuringProductFromPromotions()"
        (added)="store.addDraftFromSelection($event)"
        (cancelled)="store.closeConfig()"
      />
    }
  `,
})
export class PosCatalogDrawerComponent {
  readonly store = inject(PosTerminalStore);

  /** spec 115 (FR-001/FR-014): mismo tratamiento que
   *  `ManualOrderPageComponent.showingPromotions`, aplicado a este segundo
   *  catálogo (agregar productos a un pedido ya existente). */
  readonly showingPromotions = signal(false);

  /**
   * Mensaje del catálogo vacío (spec 134, FR-021, nivel B): alterna entre textos y uno
   * lleva lo que se escribe en el buscador; con `[textContent]` sigue al valor real
   * aunque un traductor haya envuelto el texto.
   */
  readonly emptyMessage = computed(() => {
    if (this.showingPromotions()) return 'No hay promociones activas en este momento.';
    const busqueda = this.store.catalogSearchText();
    if (busqueda) return `Sin productos que coincidan con "${busqueda}".`;
    return 'Sin productos en esta categoría.';
  });

  readonly catalogProducts = computed(() =>
    this.showingPromotions() ? this.store.catalogProductsPromotionsFiltered() : this.store.catalogProductsFiltered(),
  );

  selectPromotions(): void {
    this.showingPromotions.set(true);
  }

  selectCategory(id: string): void {
    this.showingPromotions.set(false);
    this.store.setCatalogCategory(id);
  }

  minPrice(p: { variants: { price: number; discounted_price?: number | null }[] }): number {
    return p.variants.length
      ? Math.min(...p.variants.map((v) => effectivePrice(v.price, v.discounted_price)))
      : 0;
  }
}
