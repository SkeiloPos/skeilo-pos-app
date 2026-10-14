import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { OrderSummaryCardComponent } from './order-summary-card.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Contenido de la tarjeta blanca de mesas (mockup de referencia,
 * terminal-de-mesas/code.html): franja de filtros de ocupación + buscador,
 * con la grilla responsive de tarjetas de mesa debajo (2 columnas en móvil,
 * 3 en tablet, 4 en escritorio, 5 en pantallas anchas) que envuelve y hace
 * scroll vertical — reemplaza el carrusel de una sola fila de la spec 036.
 * Las pestañas de tipo de orden (Mesas/Domicilios/Para llevar) y el resumen
 * de ocupación viven un nivel arriba, en la sub-barra de
 * `table-sessions.component.ts` -- ahí ocupan todo el ancho de la pantalla,
 * igual que en el mockup, en vez de quedar encajonadas dentro de esta sola
 * columna.
 */
@Component({
  selector: 'app-pos-tables-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OrderSummaryCardComponent, IconMiComponent],
  template: `
    <div class="w-full min-w-0 h-full flex flex-col bg-white">
      @if (store.orderTypeTab() === 'mesas') {
        <div class="flex flex-col gap-2 p-3 border-b border-gray-200 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div class="flex gap-1.5 overflow-x-auto pb-0.5 sm:overflow-visible sm:flex-wrap shrink-0">
            @for (f of filters; track f.key) {
              <button
                (click)="store.filter.set(f.key)"
                class="shrink-0 h-9 sm:h-11 px-3 rounded-[6px] text-[13px] flex items-center gap-2 transition-colors whitespace-nowrap"
                [class]="
                  store.filter() === f.key
                    ? 'bg-gray-100 text-gray-900 font-semibold'
                    : 'border border-gray-200 text-gray-600 font-medium hover:bg-gray-100'
                "
              >
                <span>{{ f.label }}</span>
                <span
                  class="px-1.5 py-0.5 text-[11px] font-medium rounded-[6px] tabular-nums"
                  [class]="
                    store.filter() === f.key
                      ? 'bg-white border border-gray-200 text-gray-900'
                      : 'bg-gray-100 text-gray-600'
                  "
                >
                  {{ countFor(f.key) }}
                </span>
              </button>
            }
          </div>
          <div class="relative sm:w-64 shrink-0">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
              <app-mi-icon name="search" [size]="18" class="text-gray-500" />
            </span>
            <input
              #searchInput
              type="text"
              [value]="store.search()"
              (input)="store.search.set($any($event.target).value)"
              placeholder="Buscar mesa…"
              class="w-full h-9 sm:h-11 pl-9 pr-12 bg-white border border-gray-200 rounded-[6px] text-[13px] text-gray-900 placeholder-gray-500 focus:outline-none focus:border-gray-900"
            />
            <span class="hidden sm:inline absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-500 text-[11px] rounded-[6px] pointer-events-none">
              [F2]
            </span>
          </div>
        </div>

        <!-- Grilla que envuelve y hace scroll vertical (no un carrusel de una
             sola fila): 2 columnas en móvil, 3 en tablet, 4 en escritorio, 5
             en pantallas anchas. -->
        <div class="flex-1 min-w-0 overflow-y-auto p-3">
          <div data-testid="mesas-grid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            @for (t of store.tablesView(); track t.id) {
              <app-order-summary-card
                [title]="'Mesa ' + t.number"
                [statusLabel]="t.statusLabelShort"
                [statusClass]="t.chipClass"
                [secondaryLabel]="t.itemsLabel"
                [elapsedLabel]="t.elapsedLabel"
                [totalLabel]="t.totalLabel"
                [ordersCount]="t.ordersCount"
                [selected]="t.selected"
                (select)="store.selectTable(t.id)"
              />
            }
          </div>
          @if (store.noTablesFound()) {
            <p class="text-center text-[13px] text-gray-500 py-8">Sin resultados</p>
          }
        </div>
      } @else if (store.ordersByType(store.orderTypeTab()).length > 0) {
        <!-- Spec 059, Historia 2/3: pedidos Domicilio/Para llevar pendientes
             de cobro, mismo formato de tarjeta y de grilla que las mesas —
             seleccionar una abre su detalle y su cobro (Historia 3). -->
        <div class="flex-1 min-w-0 overflow-y-auto p-3">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            @for (o of store.ordersByType(store.orderTypeTab()); track o.id) {
              <app-order-summary-card
                [title]="o.title"
                [statusLabel]="o.statusLabel"
                [statusClass]="o.statusClass"
                [secondaryLabel]="o.secondaryLabel"
                [elapsedLabel]="o.elapsedLabel"
                [totalLabel]="o.totalLabel"
                [selected]="o.id === store.selectedOrderId() && !store.selectedTableId()"
                (select)="store.selectStandaloneOrder(o.id)"
              />
            }
          </div>
        </div>
      } @else {
        <!-- FR-003/FR-009: listado vacío con mensaje claro, no un error ni
             una grilla en blanco sin explicación. -->
        <div class="flex flex-col items-center justify-center text-center text-gray-500 p-8 gap-3">
          <app-mi-icon name="receipt" [size]="40" />
          <p class="text-[13px] max-w-xs">
            Todavía no hay ningún pedido de
            {{ store.orderTypeTab() === 'domicilios' ? 'domicilio' : 'para llevar' }} pendiente de
            cobro.
          </p>
        </div>
      }
    </div>
  `,
})
export class PosTablesPanelComponent {
  readonly store = inject(PosTerminalStore);
  readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly filters = [
    { key: 'todas' as const, label: 'Todas' },
    { key: 'libres' as const, label: 'Libres' },
    { key: 'ocupadas' as const, label: 'Ocupadas' },
    { key: 'pendientes' as const, label: 'Pendientes' },
  ];

  focusSearch(): void {
    this.searchInput()?.nativeElement.focus();
  }

  /** Número a mostrar en el badge de cada botón de filtro (store.tableCounts()). */
  countFor(key: 'todas' | 'libres' | 'ocupadas' | 'pendientes'): number {
    const counts = this.store.tableCounts();
    if (key === 'todas') return counts.total;
    if (key === 'libres') return counts.libres;
    if (key === 'ocupadas') return counts.ocupadas;
    return counts.pendientes;
  }
}
