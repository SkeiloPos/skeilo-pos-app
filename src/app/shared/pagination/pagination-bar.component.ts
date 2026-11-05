import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconMiComponent } from '../icon-mi/icon-mi.component';

export const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

/**
 * Barra de paginación reutilizable: "Filas por página" + rango/página actual + pager
 * con flechas (ícono, sin texto).
 *
 * El selector de tamaño y el pager están gateados por condiciones independientes
 * (`total > 0` / `totalPages > 1`). Antes cada módulo envolvía ambos en un único
 * `@if (totalPages > 1)`, así que al elegir un tamaño que dejaba `totalPages` en 1
 * (p. ej. 100 con pocos ítems) el bloque entero se desmontaba y el selector
 * desaparecía sin forma de volver a bajarlo. Ver inventario/ventas, donde ese bug
 * vivía duplicado.
 */
@Component({
  selector: 'app-pagination-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconMiComponent],
  template: `
    @if (total > 0) {
      <div class="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2 text-sm">
          <span class="font-medium text-gray-700">Filas por página</span>
          <select
            [ngModel]="size"
            (ngModelChange)="sizeChange.emit($event)"
            [disabled]="loading"
            class="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            @for (s of pageSizes; track s) {
              <option [ngValue]="s">{{ s }}</option>
            }
          </select>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-sm text-gray-500">
            {{ rangeStart }}–{{ rangeEnd }} de {{ total }} · Página {{ page }} de {{ totalPages || 1 }}
          </span>
          @if (totalPages > 1) {
            <div class="flex items-center gap-1">
              <button
                type="button"
                (click)="pageChange.emit(page - 1)"
                [disabled]="page <= 1 || loading"
                aria-label="Página anterior"
                title="Página anterior"
                class="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <app-mi-icon name="chevron_left" [size]="18" />
              </button>
              <button
                type="button"
                (click)="pageChange.emit(page + 1)"
                [disabled]="page >= totalPages || loading"
                aria-label="Página siguiente"
                title="Página siguiente"
                class="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <app-mi-icon name="chevron_right" [size]="18" />
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class PaginationBarComponent {
  @Input() page = 1;
  @Input() size = 20;
  @Input() total = 0;
  @Input() totalPages = 0;
  @Input() pageSizes: number[] = DEFAULT_PAGE_SIZES;
  @Input() loading = false;

  @Output() pageChange = new EventEmitter<number>();
  @Output() sizeChange = new EventEmitter<number>();

  get rangeStart(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.size + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.page * this.size, this.total);
  }
}
