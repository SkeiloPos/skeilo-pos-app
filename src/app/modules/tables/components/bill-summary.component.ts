import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { formatMoney } from '../../../shared/money';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Desglose de cuenta reutilizable (Subtotal/Descuento/Domicilio/Total):
 * mismas filas, mismo formato de dinero (`formatMoney`, "$ 17.000") en las
 * 4+ pantallas que antes lo duplicaban con formatos distintos (store.fmt(),
 * toFixed(2) manual, DecimalPipe) -- pos-checkout-panel,
 * payment-attempt-review-panel, manual-order-page y session-bill-panel.
 *
 * Puramente presentacional: no conoce el store ni de dónde salen los
 * números, solo pinta filas. El contenedor (caja/borde/fondo) lo sigue
 * poniendo cada pantalla, porque varía bastante entre ellas.
 */
@Component({
  selector: 'app-bill-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconMiComponent],
  // spec 131: colores vía var(--terminal-color-*, valor-actual) con
  // *fallback* al literal de siempre -- este componente también lo usa
  // manual-order-page.component.ts (fuera de alcance de ese spec), así que
  // fuera de `.terminal-theme` (donde esas variables no existen) se ve
  // exactamente igual que antes; dentro de la Terminal de Mesas rediseñada
  // toma la paleta nueva. Mismo patrón ya usado en product-select.component.ts.
  template: `
    @if (subtotal !== undefined) {
      <div
        class="flex justify-between items-center text-[13px]"
        style="color:var(--terminal-color-text-secondary,#6b7280)"
      >
        <span>{{ subtotalLabel }}</span>
        <span
          class="font-mono font-medium tabular-nums"
          style="color:var(--terminal-color-text-primary,#111827)"
          >{{ money(subtotal) }}</span
        >
      </div>
    }
    @if (discount > 0) {
      <div
        class="flex justify-between items-center text-[13px]"
        style="color:var(--terminal-color-success,#15803d)"
      >
        <span>{{ discountLabel }}</span>
        <span class="font-mono font-medium tabular-nums">− {{ money(discount) }}</span>
      </div>
    }
    @if (deliveryFee > 0) {
      <div class="flex justify-between items-center text-[13px] pt-0.5" style="color:var(--terminal-color-text-secondary,#6b7280)">
        <span
          class="flex items-center gap-1"
          [style]="showDeliveryIcon ? 'color:var(--terminal-color-text-primary,#111827);font-weight:500' : ''"
        >
          @if (showDeliveryIcon) {
            <app-mi-icon name="delivery_dining" [size]="15" style="color:var(--terminal-color-primary,#7c3aed)" />
          }
          {{ deliveryFeeLabel }}
        </span>
        <span class="font-mono font-semibold tabular-nums" style="color:var(--terminal-color-text-primary,#111827)"
          >{{ showDeliveryIcon ? '+' : '' }}{{ money(deliveryFee) }}</span
        >
      </div>
    }
    <div
      class="flex justify-between items-baseline"
      [class]="totalBorder && (subtotal !== undefined || discount > 0 || deliveryFee > 0) ? 'border-t mt-0.5 pt-1.5' : ''"
      [style]="totalBorder && (subtotal !== undefined || discount > 0 || deliveryFee > 0) ? 'border-color:var(--terminal-color-border,#e5e7eb)' : ''"
    >
      <span
        class="font-bold tracking-tight"
        style="color:var(--terminal-color-text-primary,#111827)"
        [class]="size === 'lg' ? 'text-[15px]' : 'text-[13px]'"
        >{{ totalLabel }}</span
      >
      <span
        class="font-mono font-bold tabular-nums tracking-tight leading-none"
        style="color:var(--terminal-color-text-primary,#111827)"
        [class]="size === 'lg' ? 'text-[32px]' : 'text-[21px]'"
        >{{ money(total) }}</span
      >
    </div>
  `,
})
export class BillSummaryComponent {
  @Input() subtotal?: number;
  @Input() subtotalLabel = 'Subtotal';
  @Input() discount = 0;
  /**
   * spec 094 (FR-009): nombre de la promoción que explica el descuento, cuando
   * una sola lo explica. El valor por defecto es el literal de siempre, así que
   * las cuatro pantallas que ya consumen el componente y no pasan este input
   * conservan su texto y su markup exactos (Principio II, research.md D10).
   */
  @Input() discountLabel = 'Descuento';
  @Input() deliveryFee = 0;
  @Input() deliveryFeeLabel = 'Domicilio';
  @Input() showDeliveryIcon = false;
  @Input({ required: true }) total!: number;
  @Input() totalLabel = 'Total';
  @Input() size: 'sm' | 'lg' = 'sm';
  @Input() totalBorder = true;

  money(n: number): string {
    return formatMoney(n);
  }
}
