import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DEFAULT_PAGE_SIZES } from '../../../shared/pagination/pagination-bar.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Paginador propio de la lista de Órdenes (spec 121, FR-005/FR-006), con el
 * rango de resultados visibles ("X–Y de Z") del diseño de referencia que
 * `PaginationBarComponent` no muestra.
 *
 * Es un componente **aparte**, no una extensión de `PaginationBarComponent`:
 * ese componente lo reusan otras 8 pantallas (presentations, products, sales,
 * promotions, categories, tables, inventory) que no pidieron este cambio
 * visual -- Clarification de la sesión 2026-10-16 ("B"), spec.md Assumptions.
 * Mismos `@Input`/`@Output` que `PaginationBarComponent` a propósito, para que
 * reemplazarlo en la plantilla sea solo un cambio de selector.
 */
@Component({
  selector: 'app-orders-pagination',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconMiComponent],
  template: `
    @if (total > 0) {
      <div class="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2.5 text-sm font-medium text-gray-700">
          <span>Órdenes por página</span>
          <select
            [ngModel]="size"
            (ngModelChange)="sizeChange.emit($event)"
            [disabled]="loading"
            class="h-9 border border-gray-200 rounded-lg pl-3 pr-2 text-sm font-semibold text-gray-700 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-colors"
          >
            @for (s of pageSizes; track s) {
              <option [ngValue]="s">{{ s }}</option>
            }
          </select>
        </div>

        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-500">{{ rangeStart() }}–{{ rangeEnd() }} de {{ total }} · Página {{ page }} de {{ totalPages || 1 }}</span>
          @if (totalPages > 1) {
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Página anterior"
                (click)="pageChange.emit(page - 1)"
                [disabled]="page <= 1 || loading"
                class="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 disabled:bg-gray-50 disabled:text-gray-300 disabled:border-gray-100 disabled:cursor-not-allowed transition-colors"
              ><app-mi-icon name="chevron_left" [size]="18" /></button>
              <button
                type="button"
                aria-label="Página siguiente"
                (click)="pageChange.emit(page + 1)"
                [disabled]="page >= totalPages || loading"
                class="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 disabled:bg-gray-50 disabled:text-gray-300 disabled:border-gray-100 disabled:cursor-not-allowed transition-colors"
              ><app-mi-icon name="chevron_right" [size]="18" /></button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class OrdersPaginationComponent {
  @Input() page = 1;
  @Input() size = 20;
  @Input() total = 0;
  @Input() totalPages = 0;
  @Input() pageSizes: number[] = DEFAULT_PAGE_SIZES;
  @Input() loading = false;

  @Output() pageChange = new EventEmitter<number>();
  @Output() sizeChange = new EventEmitter<number>();

  /** data-model.md §4: `(page-1)*size+1`, nunca por debajo de 1 aunque `total` sea 0 (el `@if` de arriba ya lo oculta en ese caso). */
  rangeStart(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.size + 1;
  }

  /** `min(page*size, total)` -- cubre la última página parcial (p. ej. "9–10 de 10"). */
  rangeEnd(): number {
    return Math.min(this.page * this.size, this.total);
  }
}
