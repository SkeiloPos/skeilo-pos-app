import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CheckoutPreview, DiningOrder, lineTotal, PaymentAttempt } from '../interfaces/dining.interface';
import { DiningSessionService } from '../services/dining-session.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { formatMoney } from '../../../shared/money';
import { BillSummaryComponent } from './bill-summary.component';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Revisión de pagos del cajero para una orden (spec 024): aprobar/rechazar el
 * comprobante de transferencia vigente, o confirmar el efectivo calculando el
 * cambio. Vive dentro de `payment-validation-block` (feature 028), una
 * instancia por orden, completamente independiente de sus hermanas —
 * `confirm_order` (backend) exige un intento `confirmado` antes de dejar
 * avanzar la orden a comanda, así que este panel es el paso previo obligado.
 *
 * Spec 044: además, cuando el pago es en efectivo o es una transferencia que
 * todavía no tiene comprobante subido, el cajero puede rechazar el **pedido
 * completo** (con motivo obligatorio) — revierte, para esos dos casos, la
 * Decisión D5 de spec 028 (que había dejado "Rechazar" con un único
 * significado: el del intento de pago, con reintento). La transferencia con
 * comprobante ya subido conserva su "Rechazar" de siempre, sin cambios.
 */
@Component({
  selector: 'app-payment-attempt-review-panel',
  standalone: true,
  imports: [FormsModule, MoneyInputComponent, BillSummaryComponent, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="text-sm text-gray-400">Cargando pago…</p>
    } @else if (current(); as attempt) {
      <div class="border border-gray-200 bg-gray-50 rounded-lg p-2.5 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-base font-semibold text-amber-800 inline-flex items-center gap-1.5">
            <app-mi-icon name="credit_card" [size]="18" />
            {{ attempt.payment_method_name }}
          </span>
          <span class="text-sm px-2 py-1 rounded-full font-medium bg-amber-100 text-amber-700">
            Pendiente de revisión
          </span>
        </div>

        <!--
          spec 073, US7 (FR-021/FR-022): "Pagos por confirmar" es una superficie
          de cobro más. El desglose Subtotal / Descuento / Domicilio / Total lo
          calcula el backend (checkoutPreview()), nunca el navegador; el vuelto
          y el chequeo del "monto recibido" salen de este mismo Total.
        -->
        @if (checkoutPreview(); as p) {
          <div class="rounded-lg border border-gray-200 bg-white px-3 py-2 space-y-1">
            <app-bill-summary
              [subtotal]="+p.subtotal"
              [discount]="+p.discount"
              [deliveryFee]="+p.delivery_fee"
              [total]="+p.total"
              size="sm"
            />
          </div>
        } @else if (checkoutPreviewError()) {
          <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
            <span>No se pudo calcular el total.</span>
            <button
              (click)="loadCheckoutPreview()"
              class="px-2.5 py-1 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              Reintentar
            </button>
          </div>
        } @else {
          <!-- FR-024 → regla de FR-007a: nunca un total provisional mientras
               se consulta el total autoritativo. -->
          <p class="text-sm text-gray-400">Calculando el total…</p>
        }

        @if (totalChanged()) {
          <!-- FR-024: el total autoritativo difiere del que declaró el comensal
               (promoción pausada — FR-009a — o cambio de ítems — FR-010). Es solo
               informativo: spec 089 (A-96, D17) ya no exige un acuse para continuar;
               el cajero ve la diferencia y decide. -->
          <div class="rounded-lg border border-amber-300 bg-amber-100/70 px-3 py-2 text-sm text-amber-900 space-y-1.5">
            <p>
              El total cambió respecto al declarado por el comensal:
              antes {{ money(cardDeclaredTotal()) }},
              ahora {{ money(checkoutPreview()!.total) }}.
            </p>
          </div>
        }

        @if (totalChangeNotice(); as n) {
          <!-- spec 089 (A-96, FR-028/FR-030): el total cambió justo al resolver el pago (causa
               externa). Aviso NO bloqueante dentro de la tarjeta, sin diálogo: no se resolvió el
               pago; el siguiente clic usa el total nuevo. -->
          <div
            data-testid="total-cambio-aviso"
            role="status"
            class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            El total cambió: ahora es {{ money(n.now) }} (antes {{ money(n.before) }}).
            Revisa el importe y vuelve a confirmar.
          </div>
        }

        @if (attempt.is_cash) {
          <!-- Efectivo: el cajero registra el monto, el backend calcula el cambio. -->
          <div class="space-y-2">
            <app-money-input
              class="block w-full"
              [(ngModel)]="amountReceived"
              placeholder="Monto recibido"
              sizeClass="w-full min-h-11 px-3 py-2 text-base rounded-lg"
              [autofocus]="true"
            />
            @let cambio = cashChangePreview();
            @if (cambio !== null) {
              <!--
                Vista previa mientras el cajero escribe, antes de confirmar
                (feature 028): antes solo se veía el cambio DESPUÉS de
                confirmar (bloque lastResolved() más abajo), a diferencia del
                cobro de mostrador (payment-input.component.ts), que ya lo
                muestra en vivo. Ahora se muestra también en negativo (rojo)
                cuando el monto no alcanza, para que el cajero vea de una vez
                cuánto falta — antes ese caso no mostraba nada.
              -->
              <div
                class="flex items-center justify-between rounded-lg px-3 py-2"
                [class]="cambio < 0 ? 'bg-red-50' : 'bg-emerald-50'"
              >
                <span
                  class="text-sm font-medium"
                  [class]="cambio < 0 ? 'text-red-800' : 'text-emerald-800'"
                >
                  Cambio
                </span>
                <span
                  class="text-lg font-bold"
                  [class]="cambio < 0 ? 'text-red-700' : 'text-emerald-700'"
                >
                  {{ money(cambio) }}
                </span>
              </div>
            }
            <div class="flex items-center gap-2 flex-wrap">
              <button
                (click)="confirmCash(attempt)"
                [disabled]="busy() || cambio === null || cambio < 0 || !cashShiftId || actionsBlocked()"
                class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                {{ busy() ? 'Confirmando…' : 'Confirmar efectivo' }}
              </button>
              <button
                (click)="showRejectOrder.set(!showRejectOrder())"
                [disabled]="busy()"
                class="min-h-11 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
              >
                Rechazar pedido
              </button>
            </div>
          </div>
          @if (!cashShiftId) {
            <p class="text-sm text-red-600">Abre un turno de caja para poder confirmar el pago.</p>
          }
        } @else if (attempt.receipt_file_url) {
          <!-- Transferencia con comprobante ya subido: aprobar o rechazar. -->
          <div class="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              (click)="receiptPreviewOpen.set(true)"
              class="text-sm font-medium text-indigo-600 hover:underline"
            >
              Ver comprobante
            </button>
            <button
              (click)="approve(attempt)"
              [disabled]="busy() || !cashShiftId || actionsBlocked()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              Aprobar
            </button>
            <button
              (click)="showReject.set(!showReject())"
              [disabled]="busy()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Rechazar
            </button>
          </div>
          @if (!cashShiftId) {
            <p class="text-sm text-red-600">Abre un turno de caja para poder aprobar el pago.</p>
          }

          @if (showReject()) {
            <div class="flex items-center gap-2 pt-1 flex-wrap">
              <input
                type="text"
                [(ngModel)]="rejectReason"
                placeholder="Motivo del rechazo (obligatorio)"
                class="flex-1 min-h-11 px-2 py-1 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
              />
              <button
                (click)="reject(attempt)"
                [disabled]="busy() || !rejectReason.trim()"
                class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                Confirmar rechazo
              </button>
            </div>
          }
        } @else {
          <p class="text-sm text-amber-700">Esperando que el comensal suba el comprobante…</p>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              (click)="showRejectOrder.set(!showRejectOrder())"
              [disabled]="busy()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Rechazar pedido
            </button>
          </div>
        }

        @if (showRejectOrder()) {
          <!-- Spec 044: rechaza el pedido completo (no solo el intento) con motivo
               obligatorio -- solo disponible desde las ramas efectivo y "sin
               comprobante aún" de arriba; la transferencia con comprobante conserva
               su propio "Rechazar" (rechaza el intento, permite reintentar). -->
          <div class="flex items-center gap-2 pt-1 flex-wrap">
            <input
              type="text"
              [(ngModel)]="rejectOrderReason"
              placeholder="Motivo del rechazo (obligatorio)"
              class="flex-1 min-h-11 px-2 py-1 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <button
              (click)="rejectOrder(order)"
              [disabled]="busy() || !rejectOrderReason.trim()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              Confirmar rechazo del pedido
            </button>
          </div>
        }
      </div>
    } @else if (lastResolved(); as last) {
      @if (last.status === 'confirmado') {
        <p class="text-base text-emerald-700 font-medium inline-flex items-center gap-1.5">
          <app-mi-icon name="check" [size]="18" />
          Pago confirmado ({{ last.payment_method_name }})
        </p>
        @if (last.is_cash) {
          <p class="text-sm text-emerald-700">
            Recibido: {{ money(last.amount_received) }} · Cambio: {{ money(last.change_amount) }}
          </p>
        }
      } @else {
        <p class="text-sm text-gray-400">Sin pago confirmado — el último intento fue rechazado.</p>
      }
    } @else {
      <p class="text-sm text-gray-400">El comensal aún no inició el pago.</p>
    }

    <!--
      Vista previa del comprobante sin salir de la terminal (feature 028,
      T008): antes target="_blank" abría otra pestaña, lo que le hacía
      perder de vista la mesa al cajero. Overlay simple a propósito — no hay
      un modal genérico reutilizable en el codebase, y esto no lo necesita.
    -->
    @if (receiptPreviewOpen() && current()?.receipt_file_url; as url) {
      <div
        class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        (click)="receiptPreviewOpen.set(false)"
      >
        <div class="max-w-2xl max-h-[90vh] flex flex-col items-center gap-3" (click)="$event.stopPropagation()">
          <img [src]="url" alt="Comprobante de pago" class="max-w-full max-h-[80vh] rounded-lg shadow-xl object-contain" />
          <button
            type="button"
            (click)="receiptPreviewOpen.set(false)"
            class="min-h-11 px-5 py-2 bg-white text-gray-800 text-sm font-semibold rounded-xl hover:bg-gray-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    }
  `,
})
export class PaymentAttemptReviewPanelComponent implements OnChanges {
  @Input({ required: true }) order!: DiningOrder;
  /**
   * Turno de caja abierto (feature 028): aprobar/confirmar ya genera la
   * venta/factura en la misma llamada, así que la necesita — igual que el
   * cobro de mostrador. `null` si no hay turno abierto; en ese caso las
   * acciones quedan deshabilitadas.
   */
  @Input() cashShiftId: string | null = null;
  /** Se emite tras aprobar/rechazar/confirmar — el padre recarga la orden. */
  @Output() resolved = new EventEmitter<void>();

  private readonly api = inject(DiningSessionService);
  private readonly toast = inject(ToastService);

  readonly attempts = signal<PaymentAttempt[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly showReject = signal(false);
  readonly receiptPreviewOpen = signal(false);
  rejectReason = '';
  amountReceived: number | null = null;
  /** Spec 044 — rechazo de pedido completo (efectivo / sin comprobante aún).
   *  Nombres distintos de `showReject`/`rejectReason` (que siguen siendo solo
   *  del rechazo de intento con reintento, transferencia con comprobante). */
  readonly showRejectOrder = signal(false);
  rejectOrderReason = '';

  /**
   * spec 073, US7 (FR-021/FR-022): desglose autoritativo del cobro del pedido
   * QR — calculado por el backend, nunca por el navegador. Trío señal-loading-
   * error **local al componente** (este flujo no pasa por `PosTerminalStore`,
   * y cada tarjeta del panel resuelve su propio pedido).
   */
  readonly checkoutPreview = signal<CheckoutPreview | null>(null);
  readonly checkoutPreviewLoading = signal(false);
  readonly checkoutPreviewError = signal<string | null>(null);
  /**
   * spec 089 (A-96, FR-028): aviso no bloqueante de que el total cambió justo al resolver el pago
   * (causa externa). Reemplaza al modal "El total cambió" y al acuse `totalChangeAck` de la spec 073.
   * Se reinicia en cada `ngOnChanges`.
   */
  readonly totalChangeNotice = signal<{ now: number; before: number } | null>(null);

  /** FR-024: el `Total` autoritativo difiere del que la tarjeta venía
   *  mostrando (`Σ lineTotal`: `discounted_line_total ?? unit_price × quantity + addons_total`). */
  readonly totalChanged = computed(() => {
    const p = this.checkoutPreview();
    return p != null && Number(p.total) !== this.cardDeclaredTotal();
  });

  /** FR-007a: acciones de confirmación bloqueadas mientras no haya un total autoritativo
   *  (cargando o sin respuesta). spec 089: ya no se exige acuse de un cambio de total. */
  readonly actionsBlocked = computed(
    () => this.checkoutPreviewLoading() || this.checkoutPreview() == null,
  );

  ngOnChanges(): void {
    this.receiptPreviewOpen.set(false);
    this.checkoutPreview.set(null);
    this.checkoutPreviewError.set(null);
    this.totalChangeNotice.set(null);
    if (this.order) {
      this.load();
      void this.loadCheckoutPreview();
    }
  }

  /** El total que la tarjeta del pedido venía mostrando: el que declaró el
   *  comensal al armar su carrito (`discounted_line_total` congelado), o el
   *  bruto si la línea no lo trae. Base de la comparación de FR-024. */
  cardDeclaredTotal(): number {
    // spec 089 (A-94): `lineTotal` incluye los adicionales cobrados una vez por línea.
    return (this.order?.items ?? []).reduce((sum, it) => sum + lineTotal(it), 0);
  }

  /**
   * spec 073, US7 (FR-021): pide al backend el desglose autoritativo del cobro
   * de este pedido QR — `GET /orders/{id}/checkout-preview`, la misma función
   * de solo lectura que usa el panel de cobro de la Terminal. Nunca recalcula
   * el total en el navegador (spec 063, FR-023).
   */
  async loadCheckoutPreview(): Promise<void> {
    if (!this.order) return;
    this.checkoutPreviewLoading.set(true);
    this.checkoutPreviewError.set(null);
    try {
      this.checkoutPreview.set(await this.api.checkoutPreview(this.order.id));
    } catch (err) {
      this.checkoutPreview.set(null);
      this.checkoutPreviewError.set(
        this.api.extractError(err, 'No se pudo calcular el total del cobro.'),
      );
    } finally {
      this.checkoutPreviewLoading.set(false);
    }
  }

  /** El intento vigente si sigue `pendiente` — es el único sobre el que el
   *  cajero puede actuar ahora mismo. */
  current(): PaymentAttempt | null {
    return this.attempts().find((a) => a.status === 'pendiente') ?? null;
  }

  /** Si no hay ninguno pendiente, el más reciente resuelto (para mostrar
   *  "confirmado" o "el último fue rechazado, esperando reintento"). */
  lastResolved(): PaymentAttempt | null {
    const resolved = this.attempts().filter((a) => a.status !== 'pendiente');
    return resolved.length ? resolved[resolved.length - 1] : null;
  }

  /** spec 026, FR-004/FR-005: formatea el monto recibido/cambio de forma
   *  consistente con el resto de la terminal (`formatMoney`, "$ 17.000"),
   *  incluyendo explícitamente "$ 0" cuando el cambio es cero (nunca se omite
   *  el dato). */
  money(value: string | number | null): string {
    return formatMoney(Number(value ?? 0));
  }

  /** spec 073, US7 (FR-022, research.md D14): el `Total` real a cobrar sale del
   *  desglose autoritativo del backend (`checkoutPreview()`), no de una suma
   *  local. `null` mientras no haya preview — no se calcula vuelto contra un
   *  total no verificado. */
  private orderTotal(): number | null {
    const p = this.checkoutPreview();
    return p ? Number(p.total) : null;
  }

  /** Vista previa del cambio mientras el cajero escribe el monto recibido,
   *  antes de confirmar (feature 028; spec 026 FR-004 reutilizado). `null`
   *  si todavía no hay un total autoritativo o un monto — nada que mostrar
   *  aún. Puede ser negativo (el monto no alcanza): se muestra igual, en rojo
   *  desde el template, para que el cajero vea cuánto falta sin calcularlo a
   *  mano. El vuelto se calcula sobre el `Total` real con descuento y
   *  domicilio (FR-022), nunca sobre el subtotal bruto. */
  cashChangePreview(): number | null {
    const amount = this.amountReceived;
    const total = this.orderTotal();
    if (total == null || amount == null) return null;
    return amount - total;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.attempts.set(await this.api.listPaymentAttempts(this.order.id));
    } catch {
      // Silencioso: la tarjeta de la orden sigue siendo útil sin el detalle de pago.
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * spec 073, US7 (FR-024, research.md D11/D15): doble chequeo determinista
   * justo antes de resolver el pago — se vuelve a pedir el preview.
   *
   * spec 089 (A-96, FR-028/FR-030): si el `total` cambió respecto al último mostrado, ya NO se abre
   * un modal: se actualiza la cifra (`loadCheckoutPreview` ya lo hizo), se muestra un aviso no
   * bloqueante en la tarjeta y **no se resuelve el pago**; el siguiente clic usa el total nuevo.
   * Nunca se cobra un importe que el cajero no vio, y nunca es el 422 del backend lo que avisa.
   *
   * Devuelve `true` si se puede continuar, `false` si se aborta.
   */
  private async reconfirmIfTotalChanged(): Promise<boolean> {
    const before = Number(this.checkoutPreview()?.total ?? Number.NaN);
    this.totalChangeNotice.set(null);
    await this.loadCheckoutPreview();
    const fresh = this.checkoutPreview();
    if (!fresh) {
      this.toast.error('No se pudo verificar el total del cobro. Intenta de nuevo.');
      return false;
    }
    const freshTotal = Number(fresh.total);
    if (freshTotal !== before) {
      this.totalChangeNotice.set({ now: freshTotal, before });
      return false;
    }
    return true;
  }

  async approve(attempt: PaymentAttempt): Promise<void> {
    if (!this.cashShiftId) {
      this.toast.error('No hay un turno de caja abierto.');
      return;
    }
    if (this.actionsBlocked() || !(await this.reconfirmIfTotalChanged())) return;
    this.busy.set(true);
    try {
      await this.api.approvePaymentAttempt(attempt.id, this.cashShiftId);
      this.toast.success('Comprobante aprobado');
      await this.load();
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo aprobar el comprobante.'));
    } finally {
      this.busy.set(false);
    }
  }

  async reject(attempt: PaymentAttempt): Promise<void> {
    if (!this.rejectReason.trim()) return;
    this.busy.set(true);
    try {
      await this.api.rejectPaymentAttempt(attempt.id, this.rejectReason.trim());
      this.toast.info('Comprobante rechazado');
      this.rejectReason = '';
      this.showReject.set(false);
      await this.load();
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo rechazar el comprobante.'));
    } finally {
      this.busy.set(false);
    }
  }

  async confirmCash(attempt: PaymentAttempt): Promise<void> {
    if (!this.amountReceived || this.amountReceived <= 0) return;
    if (!this.cashShiftId) {
      this.toast.error('No hay un turno de caja abierto.');
      return;
    }
    if (this.actionsBlocked() || !(await this.reconfirmIfTotalChanged())) return;
    // FR-024: tras un cambio de total, el efectivo tecleado pudo quedar corto.
    const total = Number(this.checkoutPreview()!.total);
    if (this.amountReceived < total) {
      this.toast.error(
        `El efectivo recibido no cubre el total nuevo ($${total.toFixed(2)}).`,
      );
      return;
    }
    this.busy.set(true);
    try {
      const result = await this.api.confirmCashPaymentAttempt(
        attempt.id,
        this.amountReceived,
        this.cashShiftId,
      );
      const cambio = Number(result.change_amount ?? 0);
      this.toast.success(
        cambio > 0 ? `Pago confirmado — cambio: $${cambio.toFixed(2)}` : 'Pago confirmado',
      );
      this.amountReceived = null;
      await this.load();
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo confirmar el pago.'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Rechaza el pedido completo (spec 044), no solo el intento de pago vigente
   * -- reutiliza `cancelOrder` (mismo endpoint que ya usa el panel de cobro,
   * `POST /orders/{id}/cancel`), que en la misma transacción también resuelve
   * (marca `rechazado`) el intento `pendiente` de la orden. Solo se llama
   * desde las ramas efectivo / "sin comprobante aún" del template.
   */
  async rejectOrder(order: DiningOrder): Promise<void> {
    if (!this.rejectOrderReason.trim()) return;
    this.busy.set(true);
    try {
      await this.api.cancelOrder(order.id, this.rejectOrderReason.trim());
      this.toast.info('Pedido rechazado');
      this.rejectOrderReason = '';
      this.showRejectOrder.set(false);
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo rechazar el pedido.'));
    } finally {
      this.busy.set(false);
    }
  }
}
