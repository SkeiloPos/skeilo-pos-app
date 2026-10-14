import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Tarjeta reutilizable (spec 059, FR-005): mismo formato visual para una
 * mesa (`pos-tables-panel.component.ts`, extraído aquí sin cambios de
 * comportamiento) y para un pedido de Domicilio/Para llevar sin mesa. Es
 * puramente presentacional — no conoce `PosTerminalStore` ni de dónde viene
 * el dato, solo recibe props ya resueltos y emite `select` al hacer clic.
 */
@Component({
  selector: 'app-order-summary-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `contents`: el host no debe tener caja propia — el <button> de adentro
  // necesita ser hijo directo del contenedor CSS grid del padre para
  // convertirse él mismo en la celda de la grilla (mismo rol que tenía el
  // <button> inline antes de extraerlo a este componente, spec 059
  // Foundational). Sin esto, el host por defecto es `inline` y el grid del
  // padre no puede dimensionar la tarjeta como una celda propia.
  host: { class: 'contents' },
  template: `
    <button
      type="button"
      (click)="select.emit()"
      class="w-full h-full text-left bg-white rounded-[6px] border p-2.5 flex flex-col justify-between gap-1 min-h-11 transition-colors hover:bg-gray-100"
      [class]="selected ? 'border-indigo-500 ring-1 ring-indigo-200' : 'border-gray-200'"
    >
      <div class="flex items-start justify-between gap-2">
        <span class="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">{{ title }}</span>
        <span class="px-2 py-0.5 text-[11px] font-medium rounded-[6px] shrink-0" [class]="statusClass">{{ statusLabel }}</span>
      </div>
      <div class="flex items-center justify-between gap-2 text-[12px] text-gray-500">
        <span class="truncate">{{ secondaryLabel }} · {{ elapsedLabel }}</span>
        @if (ordersCount && ordersCount > 1) {
          <span class="shrink-0 px-1.5 py-0.5 rounded-[6px] bg-gray-100 text-gray-600 text-[11px]">{{ ordersCount }} pedidos</span>
        }
      </div>
      <div class="flex items-baseline justify-between pt-1 border-t border-gray-200">
        <span class="text-[11px] text-gray-500 uppercase tracking-wider font-medium">Total</span>
        <span
          class="tabular-nums"
          [class]="totalLabel === '—' ? 'text-[14px] font-medium text-gray-500' : 'text-[15px] font-semibold text-gray-900 tracking-[-0.01em]'"
        >
          {{ totalLabel }}
        </span>
      </div>
    </button>
  `,
})
export class OrderSummaryCardComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) statusLabel!: string;
  @Input({ required: true }) statusClass!: string;
  @Input({ required: true }) secondaryLabel!: string;
  @Input({ required: true }) elapsedLabel!: string;
  @Input({ required: true }) totalLabel!: string;
  @Input() ordersCount?: number;
  @Input() selected = false;

  @Output() select = new EventEmitter<void>();
}
