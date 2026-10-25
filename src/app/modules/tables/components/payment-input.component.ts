import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  computed,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';
import {
  MAX_PAYMENT_LINES,
  PaymentDraft,
  assignedTotal,
  changeDue,
  emptyPaymentDraft,
  emptyPaymentLineDraft,
  paymentIssue,
  pendingBalanceExcluding,
  roundingSuggestions,
} from '../services/payment-draft.util';
import { formatMoney } from '../services/receipt.util';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';

/**
 * Cómo paga el cliente un cobro: de 1 a 3 líneas de pago (spec 112, RN3) --
 * reabre lo que spec 046 (FR-006/FR-007) había retirado (`A-124`, registro
 * de anomalías). Con una sola línea se comporta exactamente igual que antes
 * (FR-014): se precarga con el total y no pide nada más.
 *
 * Se usa igual para la cuenta única (mostrador/pedido manual) y para el
 * bloque de cada comensal en la cuenta dividida, así que el importe a
 * cubrir llega por `total`.
 */
@Component({
  selector: 'app-payment-input',
  standalone: true,
  imports: [FormsModule, MoneyInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-3">
      @for (line of draft(); track $index; let i = $index) {
        <div
          class="space-y-2"
          [class.border-t]="i > 0"
          [class.pt-3]="i > 0"
          [style.border-color]="i > 0 ? 'var(--terminal-color-border, #e5e7eb)' : null"
        >
          <div class="flex items-center justify-between">
            <label class="block text-[13px] font-semibold" style="color:var(--terminal-color-text-secondary,#4b5563)">
              {{ draft().length > 1 ? 'Método de pago ' + (i + 1) : 'Método de pago' }}
            </label>
            @if (draft().length > 1) {
              <button
                type="button"
                (click)="removeLine(i)"
                class="text-[13px] font-medium"
                style="color:var(--terminal-color-error,#dc2626)"
              >
                Eliminar
              </button>
            }
          </div>
          <select
            [ngModel]="line.methodId"
            (ngModelChange)="setMethod(i, $event)"
            class="w-full min-h-11 px-3 py-2 rounded-[8px] text-[14px] border focus:outline-none"
            style="background:var(--terminal-color-surface,#fff);border-color:var(--terminal-color-border-strong,#d1d5db);color:var(--terminal-color-text-primary,#111827)"
          >
            <option value="">Selecciona…</option>
            @for (m of availableMethods(i); track m.id) {
              <option [value]="m.id">{{ m.name }}</option>
            }
          </select>

          @if (line.methodId) {
            <label class="block text-[13px] font-semibold" style="color:var(--terminal-color-text-secondary,#4b5563)">
              {{ isCash(line.methodId) ? 'Con cuánto paga' : 'Importe' }}
            </label>
            <app-money-input
              [ngModel]="line.amount || null"
              (ngModelChange)="setAmount(i, $event ?? 0)"
              sizeClass="min-h-11 px-3 py-2 rounded-[8px] text-base"
            />

            @if (isCash(line.methodId) && pendingBalance(i) > 0) {
              <!-- Spec 124 (FR-001 a FR-005): botones con redondeos a billetes comunes, para
                   cuando el cliente paga con uno de esos billetes -- el monto exacto ya NO es uno
                   de ellos (A-135 revertida a pedido del usuario): el campo ya nace con el saldo
                   pendiente precargado (ver setMethod), así que ofrecerlo también aquí como botón
                   sería redundante. -->
              <div class="flex flex-wrap gap-2 mt-2">
                @for (sugerencia of suggestions(i); track sugerencia) {
                  <button
                    type="button"
                    data-testid="sugerencia-monto"
                    (click)="setAmount(i, sugerencia)"
                    class="min-h-9 px-3 py-1.5 rounded-[8px] text-[13px] font-medium border"
                    [style]="
                      sugerencia === line.amount
                        ? 'border-color:var(--terminal-color-primary-border,#a5b4fc);background:var(--terminal-color-primary-soft,#eef2ff);color:var(--terminal-color-primary-text,#4338ca)'
                        : 'border-color:var(--terminal-color-border-strong,#e5e7eb);background:var(--terminal-color-surface,#fff);color:var(--terminal-color-text-secondary,#374151)'
                    "
                  >
                    {{ money(sugerencia) }}
                  </button>
                }
              </div>
            }

            @if (!isCash(line.methodId)) {
              <label class="block text-[13px] font-semibold" style="color:var(--terminal-color-text-secondary,#4b5563)">Referencia (opcional)</label>
              <input
                [ngModel]="line.reference"
                (ngModelChange)="setReference(i, $event)"
                type="text"
                placeholder="Últimos 4 dígitos o número de comprobante"
                class="w-full min-h-11 px-3 py-2 rounded-[8px] text-[14px] border focus:outline-none"
                style="background:var(--terminal-color-surface,#fff);border-color:var(--terminal-color-border-strong,#d1d5db);color:var(--terminal-color-text-primary,#111827)"
              />
            }

            @if (change(i) > 0) {
              <div
                class="flex items-center justify-between rounded-[8px] px-3 py-2"
                style="background:var(--terminal-color-success-soft,#ecfdf5)"
              >
                <span class="text-[13px] font-medium" style="color:var(--terminal-color-success,#065f46)">Cambio</span>
                <span class="text-[18px] font-bold" style="color:var(--terminal-color-success,#047857)">{{ money(change(i)) }}</span>
              </div>
            }
          }
        </div>
      }

      @if (draft().length < maxLines) {
        <button
          type="button"
          (click)="addLine()"
          class="w-full min-h-11 py-2 rounded-[8px] border border-dashed text-[13px] font-semibold transition-colors"
          style="border-color:var(--terminal-color-primary-border,#d1d5db);color:var(--terminal-color-primary-text,#4b5563)"
        >
          Agregar otro método
        </button>
      }

      @if (issue(); as problema) {
        <p class="text-[13px] font-medium" style="color:var(--terminal-color-error,#dc2626)">{{ problema }}</p>
      }
    </div>
  `,
})
export class PaymentInputComponent implements OnChanges {
  /** Lo que hay que cubrir con este cobro. */
  @Input() total = 0;
  @Input() methods: PaymentMethodCheckoutOption[] = [];
  /** Estado del pago cada vez que cambia; el padre lo usa para validar y cobrar. */
  @Output() changed = new EventEmitter<PaymentDraft>();

  readonly maxLines = MAX_PAYMENT_LINES;
  readonly draft = signal<PaymentDraft>(emptyPaymentDraft());

  readonly issue = computed(() => paymentIssue(this.draft(), this.total, this.methods));

  ngOnChanges(): void {
    // Cambió la cuenta (otra mesa, otro importe): el pago anterior ya no vale.
    this.draft.set(emptyPaymentDraft());
    this.changed.emit(this.draft());
  }

  money(n: number): string {
    return formatMoney(n);
  }

  isCash(methodId: string): boolean {
    return !!this.methods.find((m) => m.id === methodId)?.is_cash;
  }

  /** spec 135 (A-146): los métodos ya elegidos en OTRA línea del mismo
   * borrador no se ofrecen de nuevo -- conserva el propio de esta línea en
   * la lista para no deseleccionarlo al abrir el `<select>`. No es la única
   * defensa: `paymentIssue` (`issue()`) sigue rechazando si de todos modos
   * ocurriera (p. ej. al eliminar y reordenar líneas). */
  availableMethods(index: number): PaymentMethodCheckoutOption[] {
    const usedByOtherLines = new Set(
      this.draft().filter((_line, i) => i !== index).map((line) => line.methodId),
    );
    return this.methods.filter((m) => !usedByOtherLines.has(m.id));
  }

  change(index: number): number {
    return changeDue(this.draft(), index, this.total, this.methods);
  }

  /** Saldo pendiente de esa línea (spec 124, FR-001/FR-009): el total si es
   * la única línea, o lo que falte por asignar excluyendo las anteriores. */
  pendingBalance(index: number): number {
    return pendingBalanceExcluding(this.draft(), index, this.total, this.methods);
  }

  /** Hasta 5 montos sugeridos para esa línea en efectivo (spec 124, FR-001 a
   * FR-004; FR-012 revertido, ver `setMethod`), calculados sobre
   * `pendingBalance(index)` -- nunca sobre el total cuando hay otras líneas
   * (FR-009). El monto exacto se excluye si coincide con alguno: el campo ya
   * nace con él precargado, repetirlo como botón sería redundante. */
  suggestions(index: number): number[] {
    const saldo = this.pendingBalance(index);
    return roundingSuggestions(saldo).filter((s) => s !== saldo);
  }

  /** Al elegir un método, la línea se precarga con el importe justo (saldo
   * pendiente) en cualquier caso -- efectivo incluido (spec 124, FR-010/
   * FR-012, revierte la decisión de negocio `A-135` a pedido del usuario:
   * antes el campo nacía vacío a propósito para forzar al cajero a teclear
   * el monto recibido; ahora se asume que paga exacto y el cajero solo lo
   * cambia si el cliente de verdad entrega otro billete). Las líneas
   * agregadas con "Agregar otro método" ya llegan precargadas con el saldo
   * pendiente (`addLine`), así que elegir su método no les toca el
   * importe si ya traían uno. */
  setMethod(index: number, methodId: string): void {
    this.patchLine(index, (line) => ({
      ...line,
      methodId,
      amount: line.amount === 0 ? this.pendingBalance(index) : line.amount,
    }));
  }

  setAmount(index: number, value: string | number): void {
    this.patchLine(index, (line) => ({ ...line, amount: this.toAmount(value) }));
  }

  setReference(index: number, value: string): void {
    this.patchLine(index, (line) => ({ ...line, reference: value || null }));
  }

  /** RN3: hasta 3 líneas; la nueva se precarga con el saldo pendiente de las
   * que ya existen (escenario "Pago mixto... camino feliz"). */
  addLine(): void {
    if (this.draft().length >= this.maxLines) return;
    this.draft.update((d) => {
      const saldoPendiente = Math.max(0, this.total - assignedTotal(d, this.total, this.methods));
      return [...d, emptyPaymentLineDraft(saldoPendiente)];
    });
    this.changed.emit(this.draft());
  }

  /** FR-010: elimina la línea y el saldo pendiente se recalcula de
   * inmediato (es derivado de `draft()`, no hay nada más que tocar). Nunca
   * deja el borrador sin ninguna línea. */
  removeLine(index: number): void {
    this.draft.update((d) => (d.length > 1 ? d.filter((_line, i) => i !== index) : d));
    this.changed.emit(this.draft());
  }

  private toAmount(value: string | number): number {
    return Math.max(0, Number(value) || 0);
  }

  private patchLine(index: number, update: (line: PaymentDraft[number]) => PaymentDraft[number]): void {
    this.draft.update((d) => d.map((line, i) => (i === index ? update(line) : line)));
    this.changed.emit(this.draft());
  }
}
