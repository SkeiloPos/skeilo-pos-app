import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { OrderSummaryCardComponent } from './order-summary-card.component';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

/**
 * Contenido de la tarjeta de mesas: grilla responsive de tarjetas (2 columnas
 * en móvil, 3 en tablet, 4 en escritorio, 5 en pantallas anchas) que envuelve
 * y hace scroll vertical — reemplaza el carrusel de una sola fila de la spec
 * 036. Las pestañas de tipo de orden (Mesas/Domicilios/Para llevar), el
 * buscador y el filtro de ocupación viven un nivel arriba, en la misma franja
 * de la sub-barra de `table-sessions.component.ts` (spec 131, fidelidad al
 * mockup de referencia: ahí es donde viven juntos en `isTerminal`) -- este
 * componente ya no los renderiza, solo reacciona a `store.orderTypeTab()`/
 * `store.filter()`/`store.search()`.
 */
@Component({
  selector: 'app-pos-tables-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OrderSummaryCardComponent, IconLucideComponent],
  template: `
    <div class="w-full min-w-0 h-full flex flex-col" style="background:var(--terminal-color-surface)">
      @if (store.orderTypeTab() === 'mesas') {
        <!-- Grilla que envuelve y hace scroll vertical (no un carrusel de una
             sola fila): auto-fill con celdas de 240px mínimo (mismo patrón que
             el mockup de referencia, isTerminal). -->
        <div class="flex-1 min-w-0 overflow-y-auto p-4">
          <div data-testid="mesas-grid" class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr))">
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
            <p class="text-center text-[13px] py-8" style="color:var(--terminal-color-text-muted)">Sin resultados</p>
          }
        </div>
      } @else if (store.ordersByType(store.orderTypeTab()).length > 0) {
        <!-- Spec 059, Historia 2/3: pedidos Domicilio/Para llevar pendientes
             de cobro, mismo formato de tarjeta y de grilla que las mesas —
             seleccionar una abre su detalle y su cobro (Historia 3). -->
        <div class="flex-1 min-w-0 overflow-y-auto p-4">
          <div class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr))">
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
        <div class="flex flex-col items-center justify-center text-center p-8 gap-3" style="color:var(--terminal-color-text-muted)">
          <app-lucide-icon name="receipt" [size]="40" />
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
}
