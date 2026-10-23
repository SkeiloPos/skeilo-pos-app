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
import {
  CheckoutPreview,
  DiningOrder,
  lineTotal,
  PaymentAttempt,
  REJECTION_REASON_OPTIONS,
  RejectionReason,
} from '../interfaces/dining.interface';
import { DiningSessionService } from '../services/dining-session.service';
import { ToastService } from '../../../shared/feedback/toast.service';
import { MoneyInputComponent } from '../../../shared/money-input/money-input.component';
import { formatMoney } from '../../../shared/money';
import { roundingSuggestions } from '../services/payment-draft.util';
import { BillSummaryComponent } from './bill-summary.component';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

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
 *
 * Bugfix (gap de spec 130, "Pago mixto"): un intento mixto es un único row
 * con dos señales independientes (`status` para la transferencia,
 * `cash_confirmed_at` para el efectivo) — el backend solo deja avanzar el
 * pedido cuando AMBAS están presentes. Este panel antes solo sabía resolver
 * la transferencia (spec 130 dejó la UI de la pata en efectivo
 * explícitamente fuera de alcance, remitida a una "spec 112" que terminó
 * siendo otra cosa y nunca cubrió este flujo) — un pedido mixto con la
 * transferencia ya aprobada se quedaba atascado en `status='recibida'` para
 * siempre, sin ningún control visible para confirmar el efectivo. Ver
 * `isMixed()`/`cashLegPending()`/`confirmMixedCash()`.
 */
@Component({
  selector: 'app-payment-attempt-review-panel',
  standalone: true,
  imports: [FormsModule, MoneyInputComponent, BillSummaryComponent, IconLucideComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="text-sm" style="color:var(--terminal-color-text-muted,#9ca3af)">Cargando pago…</p>
    } @else if (current(); as attempt) {
      <div
        class="border rounded-[12px] p-3 space-y-2"
        style="border-color:var(--terminal-color-border,#e5e7eb);background:var(--terminal-color-surface-soft,#f9fafb)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-base font-semibold inline-flex items-center gap-1.5" style="color:var(--terminal-color-warning,#92400e)">
            <app-lucide-icon name="credit-card" [size]="18" />
            {{ attempt.payment_method_name }}
          </span>
          <span
            class="text-sm px-2 py-1 rounded-full font-medium"
            style="background:var(--terminal-color-warning-soft,#fef3c7);color:var(--terminal-color-warning,#b45309)"
          >
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
          <div
            class="rounded-[8px] border px-3 py-2 space-y-1"
            style="border-color:var(--terminal-color-border,#e5e7eb);background:var(--terminal-color-surface,#fff)"
          >
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

        @if (isMixed(attempt)) {
          <!--
            Pago mixto (spec 130): un único intento con dos señales
            independientes — transferencia (status) y efectivo
            (cash_confirmed_at). Antes este panel solo sabía resolver la
            transferencia (is_cash es false para el método "Pago mixto"),
            así que la pata de efectivo quedaba huérfana para siempre y el
            pedido nunca salía de 'recibida'.
          -->
          @if (attempt.status === 'pendiente') {
            <!-- spec 132 (A-144, FR-012): el comprobante ya no es obligatorio
                 para aprobar -- la verificación real es la del cajero en
                 persona en la mesa, no un archivo. "Ver comprobante" solo
                 aparece si el cajero mismo adjuntó una foto opcional. -->
            <p class="text-sm text-gray-700">
              Transferencia a confirmar: <strong>{{ money(attempt.transfer_amount) }}</strong>
            </p>
            <div class="flex items-center gap-2 flex-wrap">
              @if (attempt.receipt_file_url) {
                <button
                  type="button"
                  (click)="receiptPreviewOpen.set(true)"
                  class="text-sm font-medium hover:underline" style="color:var(--terminal-color-primary,#4f46e5)"
                >
                  Ver comprobante
                </button>
              }
              <button
                (click)="approve(attempt)"
                [disabled]="busy() || !cashShiftId || actionsBlocked()"
                class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                Aprobar transferencia
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
                <select
                  [(ngModel)]="rejectReason"
                  class="flex-1 min-h-11 px-2 py-1 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  <option value="" disabled>Motivo del rechazo (obligatorio)</option>
                  @for (o of rejectionReasonOptions; track o.value) {
                    <option [value]="o.value">{{ o.label }}</option>
                  }
                </select>
                <button
                  (click)="reject(attempt)"
                  [disabled]="busy() || !rejectReason"
                  class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  Confirmar rechazo
                </button>
              </div>
            }
          } @else {
            <p class="text-sm text-emerald-700 font-medium inline-flex items-center gap-1.5">
              <app-lucide-icon name="check" [size]="16" />
              Transferencia verificada ({{ money(attempt.transfer_amount) }})
            </p>
          }

          @if (cashLegPending(attempt)) {
            <!-- Misma mecánica que la rama de efectivo puro (monto + sugerencias +
                 vuelto en vivo), pero contra cash_amount (la porción fija de este
                 intento mixto, congelada desde submit_cart), no contra el Total. -->
            <div class="rounded-lg border border-gray-200 bg-white px-3 py-2 space-y-2">
              <p class="text-sm text-gray-700">
                Efectivo a confirmar: <strong>{{ money(attempt.cash_amount) }}</strong>
              </p>
              <app-money-input
                class="block w-full"
                [(ngModel)]="amountReceived"
                placeholder="Monto recibido"
                sizeClass="w-full min-h-11 px-3 py-2 text-base rounded-lg"
              />
              <div class="flex flex-wrap gap-2">
                @for (sugerencia of mixedCashSuggestions(attempt); track sugerencia) {
                  <button
                    type="button"
                    data-testid="sugerencia-monto"
                    (click)="amountReceived = sugerencia"
                    class="min-h-9 px-3 py-1.5 rounded-[8px] text-sm font-medium border"
                    [style]="
                      sugerencia === amountReceived
                        ? 'border-color:var(--terminal-color-primary-border,#a5b4fc);background:var(--terminal-color-primary-soft,#eef2ff);color:var(--terminal-color-primary-text,#4338ca)'
                        : 'border-color:var(--terminal-color-border-strong,#e5e7eb);background:var(--terminal-color-surface,#fff);color:var(--terminal-color-text-secondary,#374151)'
                    "
                  >
                    {{ sugerencia === +attempt.cash_amount! ? 'Exacto' : money(sugerencia) }}
                  </button>
                }
              </div>
              @let cambioMixto = mixedCashChangePreview(attempt);
              @if (cambioMixto !== null) {
                <div
                  class="flex items-center justify-between rounded-lg px-3 py-2"
                  [class]="cambioMixto < 0 ? 'bg-red-50' : 'bg-emerald-50'"
                >
                  <span
                    class="text-sm font-medium"
                    [class]="cambioMixto < 0 ? 'text-red-800' : 'text-emerald-800'"
                  >
                    Cambio
                  </span>
                  <span
                    class="text-lg font-bold"
                    [class]="cambioMixto < 0 ? 'text-red-700' : 'text-emerald-700'"
                  >
                    {{ money(cambioMixto) }}
                  </span>
                </div>
              }
              <button
                (click)="confirmMixedCash(attempt)"
                [disabled]="busy() || cambioMixto === null || cambioMixto < 0 || !cashShiftId || actionsBlocked()"
                class="w-full min-h-11 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                {{ busy() ? 'Confirmando…' : 'Confirmar efectivo' }}
              </button>
            </div>
            @if (!cashShiftId) {
              <p class="text-sm text-red-600">Abre un turno de caja para poder confirmar el efectivo.</p>
            }
          } @else {
            <p class="text-sm text-emerald-700 font-medium inline-flex items-center gap-1.5">
              <app-lucide-icon name="check" [size]="16" />
              Efectivo confirmado ({{ money(attempt.cash_amount) }})
            </p>
          }

          <div class="flex items-center gap-2 flex-wrap">
            <button
              (click)="showRejectOrder.set(!showRejectOrder())"
              [disabled]="busy()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Rechazar pedido
            </button>
          </div>
        } @else if (attempt.is_cash) {
          <!-- Efectivo: el cajero registra el monto, el backend calcula el cambio. -->
          <div class="space-y-2">
            <app-money-input
              class="block w-full"
              [(ngModel)]="amountReceived"
              placeholder="Monto recibido"
              sizeClass="w-full min-h-11 px-3 py-2 text-base rounded-lg"
              [autofocus]="true"
            />
            @if (orderTotal() !== null) {
              <!-- Spec 124 (FR-013): mismas sugerencias que en el panel de cobro de la
                   Terminal, calculadas sobre el total autoritativo de este pedido. -->
              <div class="flex flex-wrap gap-2 mt-2">
                @for (sugerencia of suggestions(); track sugerencia) {
                  <button
                    type="button"
                    data-testid="sugerencia-monto"
                    (click)="amountReceived = sugerencia"
                    class="min-h-9 px-3 py-1.5 rounded-[8px] text-sm font-medium border"
                    [style]="
                      sugerencia === amountReceived
                        ? 'border-color:var(--terminal-color-primary-border,#a5b4fc);background:var(--terminal-color-primary-soft,#eef2ff);color:var(--terminal-color-primary-text,#4338ca)'
                        : 'border-color:var(--terminal-color-border-strong,#e5e7eb);background:var(--terminal-color-surface,#fff);color:var(--terminal-color-text-secondary,#374151)'
                    "
                  >
                    {{ sugerencia === orderTotal() ? 'Exacto' : money(sugerencia) }}
                  </button>
                }
              </div>
            }
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
        } @else {
          <!-- spec 132 (A-144, FR-012): el comprobante ya no es obligatorio
               para aprobar -- la verificación real es la del cajero en
               persona en la mesa. "Ver comprobante" solo aparece si el
               cajero mismo adjuntó una foto opcional. -->
          <div class="flex items-center gap-2 flex-wrap">
            @if (attempt.receipt_file_url) {
              <button
                type="button"
                (click)="receiptPreviewOpen.set(true)"
                class="text-sm font-medium hover:underline" style="color:var(--terminal-color-primary,#4f46e5)"
              >
                Ver comprobante
              </button>
            }
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
              <select
                [(ngModel)]="rejectReason"
                class="flex-1 min-h-11 px-2 py-1 text-base border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
              >
                <option value="" disabled>Motivo del rechazo (obligatorio)</option>
                @for (o of rejectionReasonOptions; track o.value) {
                  <option [value]="o.value">{{ o.label }}</option>
                }
              </select>
              <button
                (click)="reject(attempt)"
                [disabled]="busy() || !rejectReason"
                class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                Confirmar rechazo
              </button>
            </div>
          }
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
          <app-lucide-icon name="check" [size]="18" />
          Pago confirmado ({{ last.payment_method_name }})
        </p>
        @if (last.is_cash) {
          <p class="text-sm text-emerald-700">
            Recibido: {{ money(last.amount_received) }} · Cambio: {{ money(last.change_amount) }}
          </p>
        }
        @if (isMixed(last)) {
          <p class="text-sm text-emerald-700">
            {{ money(last.cash_amount) }} en efectivo · {{ money(last.transfer_amount) }} por transferencia
          </p>
        }
      } @else {
        <!-- spec 132 (US5): el pago quedó rechazado -- el comensal puede
             corregir y reintentar la transferencia (un único reintento) o
             pagar el total en efectivo desde "¿Cómo vas a pagar?" en el QR;
             si ninguna de las dos funciona, el cajero cancela por impago. -->
        <p class="text-sm text-gray-400">
          Sin pago confirmado — el último intento fue rechazado
          @if (last.rejection_reason) {
            ({{ rejectionReasonLabel(last.rejection_reason) }})
          }.
        </p>
        <p class="text-xs text-gray-400 mt-1">
          El comensal puede corregir y reintentar la transferencia, o pagar el total en
          efectivo, desde "¿Cómo vas a pagar?" en su QR.
        </p>
        @if (showCancelImpago()) {
          <div class="flex items-center gap-2 pt-1 flex-wrap">
            <button
              (click)="cancelAsImpago(order)"
              [disabled]="busy()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              Confirmar cancelación por impago
            </button>
            <button
              (click)="showCancelImpago.set(false)"
              [disabled]="busy()"
              class="min-h-11 px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Cancelar
            </button>
          </div>
        } @else {
          <button
            (click)="showCancelImpago.set(true)"
            [disabled]="busy()"
            class="mt-2 min-h-11 px-4 py-2 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
          >
            Cancelar pedido por impago
          </button>
        }
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
  /** spec 132 (FR-015): conjunto cerrado — `''` ⇔ nada seleccionado aún. */
  readonly rejectionReasonOptions = REJECTION_REASON_OPTIONS;
  rejectReason: RejectionReason | '' = '';
  amountReceived: number | null = null;
  /** Spec 044 — rechazo de pedido completo (efectivo / sin comprobante aún).
   *  Nombres distintos de `showReject`/`rejectReason` (que siguen siendo solo
   *  del rechazo de intento con reintento, transferencia con comprobante). */
  readonly showRejectOrder = signal(false);
  rejectOrderReason = '';
  /** Spec 132 (US5, FR-018): confirmación de cancelar por impago tras un
   *  rechazo sin otra salida -- mismo patrón de doble clic que `showReject`. */
  readonly showCancelImpago = signal(false);

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
    this.showCancelImpago.set(false);
    this.rejectReason = '';
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

  /** Pago mixto (spec 130): `cash_amount != null` es el discriminador "este
   *  intento es mixto" — mismo criterio que usa el backend y
   *  `public-menu.component.ts` del lado del comensal. */
  isMixed(a: PaymentAttempt): boolean {
    return a.cash_amount != null;
  }

  /** Pago mixto: la pata en efectivo todavía no la confirmó el cajero. */
  cashLegPending(a: PaymentAttempt): boolean {
    return this.isMixed(a) && !a.cash_confirmed_at;
  }

  /**
   * El intento vigente sobre el que el cajero puede actuar ahora mismo.
   *
   * Bugfix (gap de spec 130): para un intento normal basta con
   * `status === 'pendiente'`. Para uno **mixto**, `status` solo representa
   * la pata de transferencia — antes, en cuanto el cajero la aprobaba
   * (`status` pasaba a `'confirmado'`), este método dejaba de devolverlo y
   * el panel caía en `lastResolved()`, mostrando "Pago confirmado" sin que
   * existiera ningún control para confirmar la pata en efectivo
   * (`cash_confirmed_at` se quedaba `null` para siempre, y con él el pedido
   * entero atascado en `status='recibida'`). Ahora sigue "vigente" mientras
   * falte cualquiera de las dos señales.
   */
  current(): PaymentAttempt | null {
    return (
      this.attempts().find(
        (a) => a.status === 'pendiente' || (a.status !== 'rechazado' && this.cashLegPending(a)),
      ) ?? null
    );
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
   *  total no verificado. Público desde spec 124 (FR-013): la plantilla lo usa
   *  para decidir si ya puede mostrar sugerencias y para etiquetar "Exacto". */
  orderTotal(): number | null {
    const p = this.checkoutPreview();
    return p ? Number(p.total) : null;
  }

  /** Hasta 5 montos sugeridos para el monto recibido en efectivo (spec 124,
   *  FR-013), calculados sobre el total autoritativo de este pedido -- para
   *  un intento **mixto** (pago mixto, ver `mixedCashSuggestions()` abajo)
   *  las sugerencias se calculan sobre `cash_amount`, no sobre este total.
   *  Vacío mientras no haya un total verificado. */
  suggestions(): number[] {
    const total = this.orderTotal();
    return total !== null ? roundingSuggestions(total) : [];
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

  /** Mismas sugerencias de monto (spec 124, FR-013) que `suggestions()`,
   *  pero para la pata en efectivo de un intento **mixto** (spec 130):
   *  calculadas sobre `cash_amount` (la porción fija de este intento), no
   *  sobre el Total del pedido — el cajero solo recibe esa porción en
   *  efectivo, el resto ya llegó por transferencia. */
  mixedCashSuggestions(attempt: PaymentAttempt): number[] {
    return roundingSuggestions(Number(attempt.cash_amount));
  }

  /** Vista previa del vuelto para la pata en efectivo de un intento mixto —
   *  mismo cálculo que `cashChangePreview()`, pero contra `cash_amount` en
   *  vez de `orderTotal()`. Puramente informativo para el cajero mientras
   *  cuenta el efectivo: el backend no valida ni guarda este monto para un
   *  intento mixto (`cash_amount` ya quedó fijo desde `submit_cart`). */
  mixedCashChangePreview(attempt: PaymentAttempt): number | null {
    const amount = this.amountReceived;
    if (amount == null) return null;
    return amount - Number(attempt.cash_amount);
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
    if (!this.rejectReason) return;
    this.busy.set(true);
    try {
      await this.api.rejectPaymentAttempt(attempt.id, this.rejectReason);
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
   * Confirma la pata en efectivo de un intento **mixto** (spec 130). A
   * pedido del usuario: el cajero escribe cuánto le dio el cliente para esta
   * porción y ve el vuelto en vivo (`mixedCashChangePreview()`), igual que
   * en el flujo de efectivo puro -- a diferencia de ese flujo, el monto
   * escrito es solo para que el cajero calcule el cambio: el backend no lo
   * valida ni lo guarda para un intento mixto (`cash_amount` ya quedó fijo
   * desde `submit_cart`, FR-006; `_confirm_cash_portion_of_mixed_attempt`
   * ignora `amount_received`), el endpoint solo exige un valor `> 0` por
   * schema -- de ahí el chequeo local contra `cash_amount` (no contra el
   * Total del pedido).
   */
  async confirmMixedCash(attempt: PaymentAttempt): Promise<void> {
    const amount = this.amountReceived;
    if (!amount || amount < Number(attempt.cash_amount)) return;
    if (!this.cashShiftId) {
      this.toast.error('No hay un turno de caja abierto.');
      return;
    }
    if (this.actionsBlocked() || !(await this.reconfirmIfTotalChanged())) return;
    this.busy.set(true);
    try {
      await this.api.confirmCashPaymentAttempt(attempt.id, amount, this.cashShiftId);
      this.toast.success('Efectivo confirmado');
      this.amountReceived = null;
      await this.load();
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo confirmar el efectivo.'));
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

  /** Etiqueta legible de un `RejectionReason` ya persistido (spec 132, FR-015). */
  rejectionReasonLabel(reason: string): string {
    return this.rejectionReasonOptions.find((o) => o.value === reason)?.label ?? reason;
  }

  /**
   * US5, Acceptance Scenario 4 (FR-017/FR-018): tercera y última salida tras
   * un rechazo sin otra resolución -- reutiliza `cancelOrder` (mismo
   * endpoint que `rejectOrder`), con el motivo distintivo que el reporte de
   * mermas usa para diferenciar esta causa de una cancelación ordinaria
   * (research.md Decisión 6).
   */
  async cancelAsImpago(order: DiningOrder): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.cancelOrder(order.id, 'impago_transferencia_rechazada');
      this.toast.info('Pedido cancelado por impago');
      this.showCancelImpago.set(false);
      this.resolved.emit();
    } catch (err) {
      this.toast.error(this.api.extractError(err, 'No se pudo cancelar el pedido.'));
    } finally {
      this.busy.set(false);
    }
  }
}
