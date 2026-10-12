import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  SimpleChanges,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  CloseSessionPayload,
  CloseSessionResponse,
  PaymentLine,
  SessionBill,
} from '../interfaces/dining.interface';
import { PaymentMethodCheckoutOption } from '../../sales/interfaces/sales.interface';
import { TableSessionService } from '../services/table-session.service';
import { PaymentInputComponent } from './payment-input.component';
import { BillSummaryComponent } from './bill-summary.component';
import {
  PaymentDraft,
  emptyPaymentDraft,
  paymentIssue,
  paymentLines,
} from '../services/payment-draft.util';
import { ToastService } from '../../../shared/feedback/toast.service';

/**
 * Cuenta de la mesa y cobro.
 *
 * El desglose por comensal es exacto porque la asignación vive en cada ítem
 * (`order_items.participant_id`), no en el pedido: un pedido que mezcle
 * personas se reparte igualmente bien.
 */
@Component({
  selector: 'app-session-bill-panel',
  standalone: true,
  imports: [PaymentInputComponent, BillSummaryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">
      <h2 class="text-[15px] font-bold text-[#111827] mb-3">Cuenta de la mesa</h2>

      @if (selectedOrderTotal !== null) {
        <!-- A pedido del usuario: al navegar entre pestañas "Pedido N" (a la
             izquierda), este total acompaña -- antes solo se veía el de toda
             la mesa, sin pista de cuánto sumaba el pedido enfocado. -->
        <div class="mb-3 pb-3 border-b border-[#e5e7eb]">
          <app-bill-summary [total]="selectedOrderTotal" totalLabel="Total de este pedido" size="sm" />
        </div>
      }

      @if (paidSummary; as pagado) {
        <!-- Bugfix reportado sobre spec 049: la mesa puede tener pedidos ya
             cobrados (p. ej. mostrador pagado por adelantado) que el total
             de abajo no incluye a propósito (evita cobrar dos veces) -- este
             bloque se ve incluso sin bill (mesa ya toda pagada, nada
             pendiente que desglosar). -->
        <div class="mb-3 pb-3 space-y-1">
          <p class="text-[11px] font-semibold text-[#6b7280] uppercase tracking-wide">Ya pagado</p>
          <!-- spec 115 (A-132): sin la fila "Descuento" -- "Subtotal" ya se muestra neto, igual
               que A-125/A-127/A-131. -->
          <app-bill-summary
            [subtotal]="pagado.subtotal - pagado.discount"
            [total]="pagado.total"
            totalLabel="Total pagado"
            size="sm"
            [totalBorder]="false"
          />
        </div>
      }

      @if (!bill) {
        @if (orphan) {
          <div class="bg-[#fffbeb] border border-[#fef3c7] rounded-[6px] px-3 py-3 space-y-1">
            <p class="text-[14px] font-semibold text-[#92400e]">No se puede cobrar esta mesa</p>
            <p class="text-[13px] text-[#b45309]">
              Tiene pedidos sin cobrar, pero su sesión está cerrada. Avisa al administrador.
            </p>
          </div>
        } @else {
          <p class="text-[14px] text-[#9ca3af] py-6 text-center">Selecciona una mesa con consumo.</p>
        }
      } @else {
        <!-- Total de TODA la mesa -- lo que realmente cobra el botón de
             abajo. El detalle producto por producto de cada pedido se ve
             tabulando a su pestaña "Pedido N" en el pedido (a la
             izquierda), no aquí. Si no queda nada por cobrar (p. ej. mesa
             pagada entera por QR, ya cubierto arriba por "Ya pagado"), este
             bloque y el aviso de solo-lectura de abajo se omiten: repetir
             un $0 no aporta nada. -->
        @if (+bill.total > 0) {
          <div class="mb-4">
            @let summary = billSummary();
            <!-- spec 115 (A-132): sin la fila "Descuento" -- "Subtotal mesa" ya se muestra neto,
                 igual que A-125/A-127/A-131. -->
            <app-bill-summary
              [subtotal]="summary ? summary.subtotal - summary.discount : undefined"
              subtotalLabel="Subtotal mesa"
              [total]="+bill.total"
              totalLabel="Total a cobrar"
              size="md"
            />
          </div>
        }

        @if (readOnly) {
          <!--
            Feature 028, T004/T009: pedido de canal qr — el comensal ya pagó a
            distancia y el cajero solo valida el comprobante (en el bloque de
            validación de pagos, no aquí). Mostrar el selector de método y el
            botón "Cobrar y cerrar mesa" en este modo era justo el bug de
            origen: cobrar de nuevo una mesa ya pagada por QR fallaba con un
            error que el cajero no sabía interpretar.
          -->
        } @else {
        <!-- Pago -->
        <div class="flex-1 overflow-y-auto space-y-2 mb-3">
          <app-payment-input
            [total]="total()"
            [methods]="methods"
            (changed)="unifiedPayment.set($event)"
          />
        </div>

        @if (error()) {
          <div class="bg-[#fef2f2] border border-[#fecaca] rounded-[6px] px-3 py-2 mb-3">
            <p class="text-[13px] text-[#b91c1c]">{{ error() }}</p>
          </div>
        }

        <button
          (click)="charge()"
          [disabled]="submitting() || !ready()"
          class="w-full min-h-11 py-2.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[14px] font-semibold rounded-[6px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {{ submitting() ? 'Cobrando...' : 'Cobrar y cerrar mesa' }}
        </button>
        }
      }
    </div>
  `,
})
export class SessionBillPanelComponent implements OnChanges {
  @Input() bill: SessionBill | null = null;
  @Input() methods: PaymentMethodCheckoutOption[] = [];
  @Input() cashShiftId: string | null = null;
  /** A nombre de quién se factura la cuenta única; vacío lo resuelve el backend. */
  @Input() customerName = '';
  /** La mesa tiene consumo pero ninguna sesión activa que cobrar. */
  @Input() orphan = false;
  /**
   * Consumo ya cobrado de la mesa (pedidos `paid`), sumado desde las ventas
   * reales — independiente de `bill` (que a propósito excluye lo ya pagado).
   * `null` sin nada pagado. Ver `PosTerminalStore.selectedTablePaidSummary`.
   */
  @Input() paidSummary: { subtotal: number; discount: number; total: number } | null = null;
  /**
   * A pedido del usuario: el total del pedido enfocado por su propia pestaña
   * "Pedido N" (a la izquierda) -- distinto del total/lo pagado de TODA la
   * mesa que ya pinta el resto de este panel. `null` con un único pedido en
   * la mesa (sin pestañas que navegar, sería redundante repetir el mismo
   * número dos veces).
   */
  @Input() selectedOrderTotal: number | null = null;
  /**
   * Feature 028 (T004/T009): `true` cuando el pedido activo es de canal `qr`
   * — el comensal ya pagó a distancia. Oculta el selector de método y el
   * botón "Cobrar y cerrar mesa"; solo queda el desglose de lectura.
   */
  @Input() readOnly = false;
  /**
   * Gancho que corre justo antes de cerrar: si devuelve `false` no se cobra.
   *
   * Lo usa la terminal para resolver de una vez los productos que siguen sin
   * marcar como listos, que el backend rechazaría con un `409`. Va como
   * callback para no acoplar este panel al store de la terminal.
   */
  @Input() beforeCharge: (() => Promise<boolean>) | null = null;
  /** Cierre completo: sus `sale_ids` son la fuente de la factura impresa. */
  @Output() charged = new EventEmitter<CloseSessionResponse>();

  private readonly api = inject(TableSessionService);
  private readonly toast = inject(ToastService);

  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Cómo se paga la cuenta única. **Es una señal**: `ready()` la lee, y un
   * `computed` solo se recalcula cuando cambia una señal. Como campo normal, el
   * botón de cobrar se quedaba deshabilitado para siempre.
   */
  readonly unifiedPayment = signal<PaymentDraft>(emptyPaymentDraft());

  /**
   * Espejo de la cuenta que llega por `@Input`.
   *
   * Los `computed` de abajo dependen de ella: leer `this.bill` directamente los
   * dejaría congelados en su primer valor, porque un campo normal no notifica
   * cambios (es el mismo fallo que tenía `unifiedMethod`).
   */
  private readonly currentBill = signal<SessionBill | null>(null);

  readonly total = computed(() => Number(this.currentBill()?.total ?? 0));

  /**
   * Subtotal/descuento agregados de toda la cuenta, sumando las mismas
   * columnas que ya trae `bill.split` por comensal (spec 049, FR-003/FR-004).
   * `bill.total` no cambia: esto solo agrega dos filas encima, sin recalcular
   * nada que el backend no haya entregado ya.
   */
  readonly billSummary = computed(() => {
    const bill = this.currentBill();
    if (!bill) return null;
    return {
      subtotal: bill.split.reduce((s, l) => s + Number(l.subtotal), 0),
      discount: bill.split.reduce((s, l) => s + Number(l.discount), 0),
    };
  });

  /**
   * Solo se cobra si el bloque de pago no tiene incidencia: método sin
   * elegir, importe corto, o un cobro electrónico por encima de lo que se
   * debe (eso descuadraría el efectivo esperado del turno).
   */
  readonly ready = computed(
    () => paymentIssue(this.unifiedPayment(), this.total(), this.methods) === null,
  );

  /**
   * Resetea el pago **solo cuando cambia la cuenta**, no ante cualquier `@Input`.
   *
   * Sin mirar `changes`, un cambio en `methods`, `cashShiftId` o `customerName`
   * —o cualquier `@Input` que se añada mañana— borraba el efectivo que el cajero
   * estaba tecleando. Ese era el motivo real de que el sondeo no pudiera recargar
   * la cuenta, y por el que un `session.bill_changed` la marca obsoleta en vez de
   * recargarla: la recarga es una decisión del cajero, con el botón "Actualizar".
   *
   * Cuando la cuenta **sí** cambia, el pago se reinicia a propósito: los importes
   * anteriores son de un total que ya no existe, y cobrarlos descuadraría el
   * turno. (`PaymentInputComponent` lo reinicia por su cuenta de todos modos al
   * recibir otro `total`.)
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['bill']) return;

    this.error.set(null);
    this.currentBill.set(this.bill);
    this.unifiedPayment.set(emptyPaymentDraft());
  }

  async charge(): Promise<void> {
    if (!this.bill || !this.cashShiftId) {
      this.error.set('No hay un turno de caja abierto.');
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      // Antes del cierre, no después: el 409 por ítems sin terminar dejaría al
      // cajero con un error que solo puede resolver en otra pantalla.
      if (this.beforeCharge && !(await this.beforeCharge())) return;
      const closed = await this.api.close(
        this.bill.table_session_id,
        this.buildPayload(this.cashShiftId),
      );
      this.toast.success('Mesa cobrada y liberada');
      this.charged.emit(closed);
    } catch (err) {
      this.showChargeError(err);
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * En cada línea de efectivo se manda **lo que entregó el cliente**, no el
   * importe justo: el backend deriva de ahí `paid_amount`/`change_given`, y
   * sin eso el vuelto no se descuenta del efectivo esperado del turno.
   *
   * Spec 046 (FR-005): "Dividir por comensal" se retiró y sigue retirada —
   * el cierre siempre cobra la cuenta completa (`billing_mode: 'unified'`).
   * Lo que spec 112 reabre (`A-124`) es combinar métodos de pago dentro de
   * ese único cobro de la cuenta completa (hasta 3 líneas, RN3).
   */
  private buildPayload(cashShiftId: string): CloseSessionPayload {
    const payments: PaymentLine[] = paymentLines(this.unifiedPayment(), this.methods);
    const nombre = this.customerName.trim();
    return {
      cash_shift_id: cashShiftId,
      billing_mode: 'unified',
      payments,
      // Vacío no se manda: el backend cae a los comensales o a la mesa.
      ...(nombre ? { customer_name: nombre } : {}),
    };
  }

  /** Los rechazos al cerrar son accionables, no genéricos: o falta confirmar
   *  pedidos, o hay comida sin terminar. */
  private showChargeError(err: unknown): void {
    const blocked = this.api.closeBlocked(err);
    if (blocked) {
      this.error.set(blocked.error);
      return;
    }
    this.error.set(this.api.extractError(err, 'No se pudo cobrar la mesa.'));
  }
}
