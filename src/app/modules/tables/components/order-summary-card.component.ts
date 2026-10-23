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
      class="w-full h-full text-left rounded-[10px] sm:rounded-[12px] border p-2.5 sm:p-4 flex flex-col gap-1.5 sm:gap-3 min-h-11 transition-colors"
      style="background:var(--terminal-color-surface)"
      [style.border-color]="selected ? 'var(--terminal-color-primary)' : 'var(--terminal-color-border)'"
    >
      <div class="flex items-center justify-between gap-2">
        <b
          class="text-[14px] sm:text-[18px]"
          style="font-family:Sora,ui-sans-serif,system-ui,sans-serif;color:var(--terminal-color-text-primary)"
          >{{ title }}</b
        >
        <span
          class="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-[11px] font-medium rounded-[6px] shrink-0"
          [class]="statusClass"
          >{{ statusLabel }}</span
        >
      </div>
      <div
        class="flex items-center justify-between gap-2 text-[11px] sm:text-[14px]"
        style="color:var(--terminal-color-text-secondary)"
      >
        <span class="truncate">{{ secondaryLabel }} · {{ elapsedLabel }}</span>
        @if (ordersCount && ordersCount > 1) {
          <span
            class="shrink-0 px-1.5 py-0.5 rounded-[6px] text-[10px] sm:text-[11px]"
            style="background:var(--terminal-color-surface-elevated);color:var(--terminal-color-text-secondary)"
          >{{ ordersCount }} pedidos</span>
        }
      </div>
      <div
        class="flex items-baseline justify-between pt-1.5 sm:pt-2.5 border-t"
        style="border-color:var(--terminal-color-border)"
      >
        <span
          class="text-[10px] sm:text-[13px] uppercase tracking-[.08em] font-semibold"
          style="color:var(--terminal-color-text-muted)"
        >Total</span>
        <b
          class="tabular-nums text-[15px] sm:text-[21px]"
          style="font-family:Sora,ui-sans-serif,system-ui,sans-serif"
          [style.color]="totalLabel === '—' ? 'var(--terminal-color-text-muted)' : 'var(--terminal-color-text-primary)'"
        >
          {{ totalLabel }}
        </b>
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
