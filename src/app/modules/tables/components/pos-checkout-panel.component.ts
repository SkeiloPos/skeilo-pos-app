import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { getSidebarMode } from '../interfaces/dining.interface';
import { SessionBillPanelComponent } from './session-bill-panel.component';
import { PaymentInputComponent } from './payment-input.component';
import { BillSummaryComponent } from './bill-summary.component';
import { PaymentAttemptReviewPanelComponent } from './payment-attempt-review-panel.component';
import {
  PaymentDraft,
  emptyPaymentDraft,
  paymentIssue,
  paymentLines,
} from '../services/payment-draft.util';
import { IconLucideComponent } from '../../../shared/icon-lucide/icon-lucide.component';

/**
 * Cuenta de la mesa y cobro -- se apila debajo de `app-pos-order-panel`
 * (siempre en una sola columna, a pedido del usuario; antes iba al lado en
 * pantallas anchas).
 *
 * A pedido del usuario: el comprobante/confirmación de un pago QR pendiente
 * (`app-payment-attempt-review-panel`) solo se muestra cuando el pedido
 * seleccionado ES ese pago pendiente (`store.selectedOrderPending()`, su
 * propia pestaña "Pedido N" o la selección por defecto de `selectTable()`
 * cuando es el único pedido de la mesa) -- antes se veía siempre que la mesa
 * tuviera algún pago pendiente, sin importar cuál pestaña estuviera activa
 * (hotfix retirado a pedido del usuario: quedaba visible aunque el cajero
 * estuviera mirando otro pedido de la misma mesa).
 *
 * Feature 028 ("terminal híbrida por origen"): la barra lateral ya no muestra
 * siempre el mismo panel de cobro — se decide por el **origen** del pedido
 * activo (`getSidebarMode`, `dining.interface.ts`, T002/T004):
 *
 * - `'resumen'` (canal `qr`): el comensal ya pagó a distancia. Panel de solo
 *   lectura — `app-session-bill-panel` en modo `readOnly` (T009): desglose,
 *   sin selector de método ni botón de cobro. Ahí vivía el bug de origen de
 *   esta pantalla (cobrar de nuevo una mesa ya pagada por QR reventaba con un
 *   error que el cajero no sabía interpretar).
 * - `'terminal-pos'` (canal `counter`/`waiter`, o mesa libre sin pedido
 *   todavía): panel editable — carrito + método de pago + nombre de
 *   facturación + un único botón "Cobrar" (`POST /orders/{id}/checkout-and-
 *   send`, T024/T025). Es un pedido, no una sesión: no pasa por
 *   `TableSessionService.close()`.
 *
 * "Imprimir Pre-cuenta" (T032) se ve en ambos modos. "Imprimir Factura" y
 * "Liberar Mesa" (T035) también, salvo mientras el pedido de `terminal-pos`
 * sigue con el cobro pendiente (`pendingCheckout()`, spec 058, FR-007) — son
 * acciones post-cobro, no tiene sentido ofrecerlas antes de que el pedido se
 * facture.
 */
@Component({
  selector: 'app-pos-checkout-panel',
  standalone: true,
  imports: [
    SessionBillPanelComponent,
    PaymentInputComponent,
    BillSummaryComponent,
    PaymentAttemptReviewPanelComponent,
    IconLucideComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // spec 078 (US3/US4, research.md D4/D5): min-w-0 para que cliente/método
  // largos no lo ensanchen.
  //
  // Estas clases viven en el HOST, no en un <div> dentro del template: en
  // Angular, <app-pos-checkout-panel> (el host) es el hijo real dentro del
  // flex row de table-sessions.component.ts -- un <div> del template es OTRO
  // elemento, anidado DENTRO del host, que nunca participa en el flex del
  // padre. Con las clases de ancho/scroll en ese div (como estaban antes),
  // "lg:w-[40%]" se resolvía contra un host sin ancho definido (auto,
  // encogido a su contenido) en vez de contra el 40% real de la fila -- el
  // panel de cobro se veía angosto y con el texto amontonado en desktop, sin
  // usar el ancho que sí tenía reservado.
  //
  // Por debajo de lg: apilado bajo el pedido, a su alto natural y sin scroll
  // propio (a pedido del usuario, hotfix posterior) -- antes tenía su propia
  // zona con overflow-y-auto y un techo (primero max-h-[55%], luego
  // max-h-[38dvh]), una caja interna más además del carrito de
  // app-pos-order-panel, cada una recortando su contenido por separado. Es
  // la columna de detalle (table-sessions.component.ts) la que scrollea el
  // bloque completo (pedido + esta cuenta) de una sola vez si no alcanza.
  //
  // Desde lg: columna aparte al lado del pedido (40% del ancho, en vez de
  // apilada) -- border-l en vez de border-t, y scroll propio
  // (lg:overflow-y-auto) porque ahora es una columna independiente con su
  // propio alto completo, no un bloque más de un scroll compartido.
  host: {
    class:
      'w-full flex flex-col border-t min-w-0 lg:w-[40%] lg:shrink-0 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l',
    style: 'border-color:var(--terminal-color-border,#e5e7eb);background:var(--terminal-color-surface,#fff)',
  },
  template: `
      <div class="p-4">
        <!--
          El aviso va AQUÍ y no dentro de <app-session-bill-panel> a propósito:
          ese componente resetea el método de pago y el efectivo recibido en su
          ngOnChanges, así que pasarle un @Input nuevo le borraría al cajero lo
          que está tecleando justo cuando llega el evento. La recarga es un acto
          deliberado suyo.
        -->
        @if (store.billStale() && !store.billLoading()) {
          <div
            class="mb-3 flex items-center gap-2 rounded-[8px] border px-3 py-2"
            style="border-color:var(--terminal-color-warning-soft,#fef3c7);background:var(--terminal-color-warning-soft,#fffbeb)"
          >
            <span class="text-[13px] flex-1" style="color:var(--terminal-color-warning,#92400e)">La cuenta cambió</span>
            <button
              (click)="store.refreshBill()"
              class="px-2.5 py-1 rounded-[6px] text-white text-[11px] font-semibold transition-colors"
              style="background:var(--terminal-color-warning,#d97706)"
            >
              Actualizar
            </button>
          </div>
        }
        @if (store.billLoading()) {
          <p class="text-[12px] py-8 text-center" style="color:var(--terminal-color-text-muted,#9ca3af)">Cargando cuenta…</p>
        } @else {
          @if (store.selectedOrderPending()) {
            <!-- A pedido del usuario: el comprobante/confirmación de un pago
                 QR pendiente (app-payment-attempt-review-panel) solo se
                 muestra cuando el cajero entra puntualmente a esa pestaña
                 "Pedido N" (a la izquierda) -- antes se veía siempre que la
                 mesa tuviera algún pago pendiente, sin importar cuál pestaña
                 estuviera activa, lo que lo hacía aparecer aunque el cajero
                 estuviera mirando otro pedido de la misma mesa. -->
            @if (store.selectedOrder(); as pending) {
              <div class="mb-4">
                <div class="flex items-center justify-between gap-3 mb-3">
                  <p class="text-[12px]" style="color:var(--terminal-color-text-secondary,#6b7280)">
                    Aprobar el comprobante o confirmar el pago registra el pedido como una venta en
                    el sistema.
                  </p>
                  <button
                    (click)="store.reload()"
                    class="text-[12px] font-medium transition-colors shrink-0"
                    style="color:var(--terminal-color-primary-text,#9ca3af)"
                  >
                    Actualizar
                  </button>
                </div>
                <app-payment-attempt-review-panel
                  [order]="pending"
                  [cashShiftId]="store.cashShiftId()"
                  (resolved)="store.reload()"
                />
              </div>
            }
          } @else {
          <!--
            El pedido seleccionado no es un pago QR pendiente: cobro normal
            según el origen (T004/T009).
          -->
          @if (store.selectedOrder() && sidebarMode() === 'resumen') {
          <!-- Origen QR: solo lectura (T004/T009). -->
          <app-session-bill-panel
            [bill]="store.sessionBill()"
            [methods]="store.paymentMethodsAvailable()"
            [cashShiftId]="store.cashShiftId()"
            [customerName]="store.customerName()"
            [orphan]="store.billOrphan()"
            [paidSummary]="store.selectedTablePaidSummary()"
            [selectedOrderTotal]="store.selectedOrderTotal()"
            [readOnly]="true"
          />
        } @else if (store.selectedOrder() && showSessionCharge()) {
          <!--
            Pedido de mesero ya enviado a cocina (status distinto de
            'recibida'): se cobra cerrando la sesión de mesa completa — el
            mismo mecanismo que el modo resumen usa en solo lectura arriba —,
            no con checkout-and-send (que exige 'recibida' y por eso
            rechazaba siempre con 409 sobre un pedido así, dejándolo abierto
            para siempre sin factura). Hotfix spec 029 #3: esta vía ya
            existía en el backend y en session-bill-panel, solo nunca se
            conectaba aquí. ensureReadyToCharge resuelve de una vez los
            productos que sigan sin marcar como listos antes de cobrar.
          -->
          <div class="flex flex-col h-full">
            <app-session-bill-panel
              [bill]="store.sessionBill()"
              [methods]="store.paymentMethodsAvailable()"
              [cashShiftId]="store.cashShiftId()"
              [customerName]="store.customerName()"
              [orphan]="store.billOrphan()"
              [paidSummary]="store.selectedTablePaidSummary()"
              [selectedOrderTotal]="store.selectedOrderTotal()"
              [beforeCharge]="store.ensureReadyToCharge"
              (charged)="store.onCharged($event)"
            />
            <!--
              Spec 029, hotfix #4: hasta ahora la única acción sobre este
              pedido era cobrar. cancel_order ya existía en el backend
              (sin venta ni movimiento de caja) pero no estaba conectado.
            -->
            <button
              (click)="store.rejectOrder()"
              [disabled]="store.submitting()"
              class="w-full min-h-11 py-2 mt-2 rounded-[8px] border text-[13px] font-medium disabled:opacity-40 transition-colors"
              style="border-color:var(--terminal-color-error,#fca5a5);color:var(--terminal-color-error,#b91c1c);background:none"
            >
              Rechazar pedido
            </button>
          </div>
        } @else if (
          (store.selectedOrder() || store.pendingOfSelectedTable().length === 0) &&
          store.centralState() !== 'ocupada-sin-pedido'
        ) {
          <!--
            Origen mostrador (o mesa sin pedido todavía): cobro editable (T024).

            Spec 110: excluida a propósito cuando centralState() es
            'ocupada-sin-pedido' -- esta mesa ya tiene sesión abierta sin
            ningún pedido vivo, y "+ Crear pedido nuevo" duplicaría el mismo
            CTA que ya ofrece la sub-barra para esa mesa (newOrderTableId()
            sigue apuntándole). La única acción que debe verse en ese caso es
            "Liberar Mesa" (bloque de abajo).
          -->
          <div class="flex flex-col h-full">
            <h2
              class="mb-4"
              style="font-family:Sora,ui-sans-serif,system-ui,sans-serif;font-size:18px;font-weight:700;color:var(--terminal-color-text-primary,#111827)"
            >
              {{ store.selectedOrder() ? 'Cobrar pedido' : 'Pedido de mostrador' }}
            </h2>

            @if (!store.selectedOrder()) {
              <!-- Spec 045: único contenido de este panel sin pedido -- ya no
                   arma un carrito propio aquí (ese flujo embebido se retiró,
                   spec 036 nota posterior); crear un pedido nuevo se hace en
                   la vista dedicada (manual-order-page.component.ts).

                   spec 087 (FR-007, T045/T046): a propósito se mantiene
                   acotado a "sin pedido seleccionado" -- el pedido en
                   paralelo (mesa que YA tiene un pedido abierto) ya se
                   habilita desde el CTA de la sub-barra
                   (table-sessions.component.ts), que queda visible en ese
                   caso; duplicarlo aquí mostraría dos botones "Crear pedido
                   nuevo" a la vez en la misma pantalla. -->
              <button
                type="button"
                (click)="goToNewOrder()"
                [disabled]="!newOrderTableId()"
                [title]="!newOrderTableId() ? 'No hay ninguna mesa libre disponible' : ''"
                class="w-full py-2.5 rounded-[8px] text-[13px] font-semibold disabled:opacity-40 transition-colors"
                style="background:var(--terminal-color-primary,#7c3aed);color:#fff"
              >
                + Crear pedido nuevo
              </button>
            } @else {
              <div class="mb-3">
                <label
                  class="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                  style="color:var(--terminal-color-text-muted,#6b7280)"
                  >Facturar a nombre de</label
                >
                <div class="relative">
                  <input
                    type="text"
                    [value]="store.billingCustomerName()"
                    [readOnly]="!editandoFacturacion()"
                    (input)="store.billingCustomerName.set($any($event.target).value)"
                    (blur)="onFacturacionBlur()"
                    placeholder="Consumidor Final"
                    class="w-full min-h-11 px-3 py-2 pr-9 rounded-[8px] text-[14px] border focus:outline-none"
                    [style]="
                      editandoFacturacion()
                        ? 'background:var(--terminal-color-surface,#fff);border-color:var(--terminal-color-primary-border,#7c3aed);color:var(--terminal-color-text-primary,#111827)'
                        : 'background:var(--terminal-color-surface-soft,#f9fafb);border-color:var(--terminal-color-border-strong,#d1d5db);color:var(--terminal-color-text-secondary,#6b7280)'
                    "
                  />
                  <button
                    type="button"
                    (click)="toggleEditarFacturacion()"
                    title="Editar nombre de facturación"
                    class="absolute right-2 inset-y-0 flex items-center transition-colors"
                    style="color:var(--terminal-color-text-muted,#9ca3af)"
                  >
                    <app-lucide-icon name="pencil" ariaLabel="Editar nombre de facturación" [size]="16" />
                  </button>
                </div>
              </div>

              <!--
                spec 073, FR-002/FR-004: el importe lo calcula el backend
                (checkoutPreview()), nunca el navegador. Desglose agregado
                Subtotal / Domicilio / Total, con el mismo formato que la
                cuenta de mesa; Domicilio solo si es > 0.
                spec 115 (A-131): sin la fila "Descuento" -- "Subtotal" ya se
                muestra neto (sin el descuento), igual que A-125/A-127.
              -->
              @if (displayedPreview(); as p) {
                <div
                  class="rounded-[8px] px-3 py-2.5 my-3 space-y-1.5"
                  style="background:var(--terminal-color-surface-elevated,#f3f4f6)"
                >
                  <app-bill-summary
                    [subtotal]="+p.subtotal - +p.discount"
                    [deliveryFee]="+p.delivery_fee"
                    [total]="+p.total"
                    size="sm"
                  />
                  @if (store.checkoutPreviewEstimate() !== null) {
                    <!-- spec 089 (A-96): cifra estimada al instante mientras el servidor
                         confirma; Cobrar queda deshabilitado hasta tener la confirmada. -->
                    <p data-testid="total-actualizando" class="text-[11px] text-right" style="color:var(--terminal-color-text-muted,#9ca3af)">
                      actualizando…
                    </p>
                  }
                </div>
              } @else {
                <!-- FR-007a: nunca un total provisional — estado "calculando"
                     visible y "Cobrar" deshabilitado hasta recibir el total. -->
                <p class="text-[13px] py-3 text-center" style="color:var(--terminal-color-text-muted,#9ca3af)">Calculando el total…</p>
              }

              @if (store.checkoutPreviewStale() && !store.checkoutPreviewLoading()) {
                <div
                  class="mb-3 flex items-center gap-2 rounded-[8px] border px-3 py-2"
                  style="border-color:var(--terminal-color-warning-soft,#fef3c7);background:var(--terminal-color-warning-soft,#fffbeb)"
                >
                  <span class="text-[13px] flex-1" style="color:var(--terminal-color-warning,#92400e)">El total cambió</span>
                  <button
                    (click)="store.loadCheckoutPreview(store.selectedOrderId())"
                    class="px-2.5 py-1 rounded-[6px] text-white text-[11px] font-semibold transition-colors"
                    style="background:var(--terminal-color-warning,#d97706)"
                  >
                    Actualizar
                  </button>
                </div>
              }

              @if (totalChangeNotice(); as n) {
                <!-- spec 089 (A-96, FR-028): el total cambió justo al cobrar (causa externa). Aviso
                     NO bloqueante dentro del panel, sin diálogo: no se cobró; el siguiente Cobrar
                     cobra el importe que se ve ahora. -->
                <div
                  data-testid="total-cambio-aviso"
                  role="status"
                  class="mb-3 rounded-[8px] border px-3 py-2"
                  style="border-color:var(--terminal-color-warning-soft,#fef3c7);background:var(--terminal-color-warning-soft,#fffbeb)"
                >
                  <span class="text-[13px]" style="color:var(--terminal-color-warning,#92400e)">
                    El total cambió: ahora es {{ store.fmt(n.now) }} (antes {{ store.fmt(n.before) }}).
                    Revisa el importe y vuelve a pulsar Cobrar.
                  </span>
                </div>
              }

              @if (preview()) {
                <app-payment-input
                  [total]="previewTotal()"
                  [methods]="store.paymentMethodsAvailable()"
                  (changed)="paymentDraft.set($event)"
                />
              }

              @if (store.error()) {
                <div class="rounded-[8px] border px-3 py-2 my-3" style="border-color:var(--terminal-color-error-soft,#fecaca);background:var(--terminal-color-error-soft,#fef2f2)">
                  <p class="text-[13px]" style="color:var(--terminal-color-error,#b91c1c)">{{ store.error() }}</p>
                </div>
              }

              <button
                (click)="checkout()"
                [disabled]="store.checkoutSubmitting() || !preview() || store.checkoutPreviewLoading() || store.checkoutPreviewEstimate() !== null || issue() !== null"
                class="w-full min-h-11 py-2.5 mt-3 bg-[#15803d] hover:bg-[#166534] text-white text-[14px] font-semibold rounded-[8px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {{ store.checkoutSubmitting() ? 'Cobrando…' : 'Cobrar' }}
              </button>

              <!-- Spec 029, hotfix #4: alternativa a cobrar, sin venta ni movimiento de caja. -->
              <button
                (click)="store.rejectOrder()"
                [disabled]="store.submitting() || store.checkoutSubmitting()"
                class="w-full min-h-11 py-2 mt-2 rounded-[8px] border text-[13px] font-medium disabled:opacity-40 transition-colors"
                style="border-color:var(--terminal-color-error,#fca5a5);color:var(--terminal-color-error,#b91c1c);background:none"
              >
                Rechazar pedido
              </button>
            }
          </div>
          }
          }
        }
      </div>

      @if (store.sessionBill(); as bill) {
        <!--
          Spec 058, FR-007: "Imprimir Factura" y "Liberar Mesa" son acciones
          post-cobro -- no se muestran mientras este mismo pedido sigue en la
          rama de cobro pendiente (pendingCheckout()). Reaparecen en los demás
          modos del panel (resumen QR, showSessionCharge) sin cambios (FR-008).
        -->
        @if (!pendingCheckout()) {
          <div class="p-3 border-t space-y-2 shrink-0" style="border-color:var(--terminal-color-border,#e5e7eb)">
            <!-- spec 123 (FR-006/FR-016): saldo generado por adiciones agregadas
               después de facturar -- visible mientras exista, con su propia
               acción de cobro (reutiliza el mismo selector de método de pago
               del cobro normal). Bloquea "Liberar Mesa" en el backend hasta
               cobrarse íntegramente. -->
            @if (store.selectedOrder(); as pendingOrder) {
              @if (+(pendingOrder.pending_balance ?? 0) > 0) {
                <div
                  class="rounded-[8px] border p-2.5 space-y-2"
                  style="background:var(--terminal-color-warning-soft,#fffbeb);border-color:var(--terminal-color-warning-soft,#fde68a)"
                >
                  <div class="text-[13px] font-semibold" style="color:var(--terminal-color-warning,#92400e)">
                    Saldo pendiente: {{ store.fmt(+pendingOrder.pending_balance!) }}
                  </div>
                  <app-payment-input
                    [total]="+pendingOrder.pending_balance!"
                    [methods]="store.paymentMethodsAvailable()"
                    (changed)="pendingBalanceDraft.set($event)"
                  />
                  <button
                    (click)="settlePendingBalance(pendingOrder.id)"
                    [disabled]="store.submitting() || pendingBalanceDraft().length !== 1 || !pendingBalanceDraft()[0].methodId"
                    class="w-full min-h-10 py-2 text-white text-[13px] font-semibold rounded-[8px] disabled:opacity-40 transition-colors"
                    style="background:var(--terminal-color-warning,#d97706)"
                  >
                    Cobrar saldo
                  </button>
                </div>
              }
            }
            @if (store.selectedOrder(); as order) {
              <!--
                FR-001/FR-002 (spec 029, Historia 4): única acción de impresión
                tras el pago — reimprime la factura de CUALQUIER pedido ya
                facturado, sea QR o de mostrador, sin importar quién lo cobró
                ni en qué pestaña (con lookup al backend — ver
                PosTerminalStore.printOrderInvoice). Reemplaza el botón del
                diálogo de éxito para el caso de un solo comprobante, que
                duplicaba esta misma acción. Sin ella para un pago QR todavía
                sin confirmar (selectedOrderPending()) -- no hay ninguna
                factura que reimprimir. Tampoco mientras la mesa tenga algún
                otro pago QR pendiente de revisión (centralState() ===
                'validar-pago') -- a pedido del usuario, para no ofrecer
                "Imprimir Factura" junto al comprobante todavía sin aprobar.
              -->
              @if (!store.selectedOrderPending() && store.centralState() !== 'validar-pago') {
              <button
                (click)="store.printOrderInvoice(order.id)"
                class="w-full min-h-11 py-2 rounded-[8px] border text-[13px] font-medium transition-colors inline-flex items-center justify-center gap-1.5"
                style="border-color:var(--terminal-color-border-strong,#e5e7eb);color:var(--terminal-color-text-secondary,#4b5563);background:var(--terminal-color-surface,#fff)"
              >
                <app-lucide-icon name="receipt" [size]="16" />
                Imprimir Factura
              </button>
              }
            }
            @if (store.centralState() !== 'validar-pago') {
              <!--
                Spec 046, FR-001/FR-002: mientras la mesa tenga al menos un pago
                QR pendiente de confirmar (centralState() === 'validar-pago',
                mismo computed que decide el panel central), "Liberar Mesa" no
                se muestra -- evita liberar la mesa antes de validar que el
                dinero/comprobante corresponde. Reaparece solo (reactivo) en
                cuanto se confirma/aprueba el pago, sin código adicional.
              -->
              <button
                (click)="store.releaseTable()"
                [disabled]="store.submitting()"
                class="w-full min-h-11 py-2 rounded-[8px] border text-[13px] font-medium disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-1.5"
                style="border-color:var(--terminal-color-border-strong,#e5e7eb);color:var(--terminal-color-text-secondary,#4b5563);background:var(--terminal-color-surface,#fff)"
              >
                <app-lucide-icon name="lock-open" [size]="16" />
                Liberar Mesa
              </button>
            }
          </div>
        }
      }
  `,
})
export class PosCheckoutPanelComponent {
  readonly store = inject(PosTerminalStore);
  private readonly router = inject(Router);

  /**
   * Spec 045: mesa destino del botón fijo "+ Crear pedido nuevo" -- la mesa
   * libre ya seleccionada (estado informativo del panel central), o la
   * primera mesa libre disponible si ninguna lo está. `null` (botón
   * deshabilitado) si no hay ninguna mesa libre en absoluto. Vive en el
   * store (`newOrderTableId`) porque `table-sessions.component.ts` necesita
   * el mismo criterio para su propio CTA del estado vacío sin selección.
   */
  readonly newOrderTableId = this.store.newOrderTableId;

  /** Navega a la vista dedicada de armado de pedido nuevo
   *  (manual-order-page.component.ts) -- mismo destino al que antes se
   *  llegaba haciendo clic directo en una mesa libre. */
  goToNewOrder(): void {
    const tableId = this.newOrderTableId();
    if (!tableId) return;
    this.router.navigate(['/dashboard/mesas-sesiones', tableId, 'orden-manual']);
  }

  /** T004: qué panel de cobro va según el origen del pedido activo. */
  readonly sidebarMode = computed(() => getSidebarMode(this.store.selectedOrder()));

  /**
   * Spec 029, hotfix #3: dentro de `terminal-pos`, un pedido que ya se envió
   * a cocina (`status !== 'recibida'`) no se puede cobrar con
   * `checkout-and-send` (el backend lo rechaza con 409) — necesita el cierre
   * de sesión de mesa (`app-session-bill-panel`, mismo componente que
   * `resumen` usa en solo lectura arriba).
   */
  readonly showSessionCharge = computed(() => {
    const order = this.store.selectedOrder();
    return !!order && order.status !== 'recibida';
  });

  /** Spec 058, FR-007: mismo estado que decide la rama "Cobrar pedido"/"Pedido de
   *  mostrador" (única rama con un pedido seleccionado cuyo cobro aún no se ha
   *  efectuado) — usado para ocultar el footer "Imprimir Factura"/"Liberar Mesa",
   *  acciones que solo aplican después del cobro. */
  readonly pendingCheckout = computed(
    () => this.sidebarMode() === 'terminal-pos' && !!this.store.selectedOrder() && !this.showSessionCharge(),
  );

  /** Cómo paga el cajero el pedido de mostrador que se está cobrando (T024/T025). */
  readonly paymentDraft = signal<PaymentDraft>(emptyPaymentDraft());

  /** spec 123: cómo paga el cajero el saldo pendiente -- borrador aparte del
   *  cobro normal (`paymentDraft`), aunque comparta el mismo componente de
   *  selección de método. Siempre debe quedar en un único renglón (FR-018);
   *  el botón "Cobrar saldo" se deshabilita si no es así. */
  readonly pendingBalanceDraft = signal<PaymentDraft>(emptyPaymentDraft());

  async settlePendingBalance(orderId: string): Promise<void> {
    const [line] = paymentLines(this.pendingBalanceDraft(), this.store.paymentMethodsAvailable());
    if (!line) return;
    await this.store.settlePendingBalance(orderId, line);
    this.pendingBalanceDraft.set(emptyPaymentDraft());
  }

  /** Spec 058: modo edición de "Facturar a nombre de" — solo lectura por defecto, mismo
   *  patrón que `editandoCliente` en `manual-order-page.component.ts` (spec 054). Estado
   *  puramente de interacción de este componente, no vive en el store. */
  readonly editandoFacturacion = signal(false);

  toggleEditarFacturacion(): void {
    this.editandoFacturacion.set(true);
  }

  onFacturacionBlur(): void {
    this.editandoFacturacion.set(false);
  }

  /**
   * spec 073, FR-001/FR-002: el desglose autoritativo del cobro del pedido
   * seleccionado (backend). Mientras `checkoutPreviewLoading()` es verdadero o
   * no llegó ningún preview, es `null` y "Cobrar" queda deshabilitado (FR-007a)
   * — nunca se pinta un total provisional.
   */
  readonly preview = this.store.checkoutPreview;

  /**
   * spec 089 (A-96): lo que se PINTA. Con un estimado en curso (agregar/quitar un producto), el
   * último preview confirmado con el subtotal y el total estimados; si no, el confirmado tal cual.
   * Solo el confirmado se cobra (Cobrar está deshabilitado mientras haya estimado).
   */
  readonly displayedPreview = computed(() => {
    const confirmed = this.store.checkoutPreview();
    const estimate = this.store.checkoutPreviewEstimate();
    if (!confirmed || !estimate) return confirmed;
    return { ...confirmed, subtotal: String(estimate.subtotal), total: String(estimate.total) };
  });

  /** El total real a cobrar (número): el estimado mientras se confirma, si no el del preview del
   *  backend — reemplaza `store.totals().total` para el pedido de mostrador/mesa individual. */
  readonly previewTotal = computed(() => Number(this.displayedPreview()?.total ?? 0));

  /**
   * spec 089 (A-96, FR-028): aviso no bloqueante de que el total cambió justo al pulsar Cobrar
   * (causa externa). Reemplaza al modal "El total cambió" de la spec 073.
   */
  readonly totalChangeNotice = signal<{ now: number; before: number } | null>(null);

  readonly issue = computed(() =>
    paymentIssue(this.paymentDraft(), this.previewTotal(), this.store.paymentMethodsAvailable()),
  );

  /** El total que se le mostró al cajero la última vez que abrió/refrescó el
   *  panel — base de la comparación de FR-007 antes de someter el cobro. */
  private lastShownTotal: number | null = null;

  constructor() {
    // El pago anterior no vale para otro pedido: se reinicia al cambiar de
    // selección, igual que hace `SessionBillPanelComponent` con `bill`.
    effect(() => {
      const orderId = this.store.selectedOrderId();
      this.paymentDraft.set(emptyPaymentDraft());
      this.editandoFacturacion.set(false);
      this.lastShownTotal = null;
      this.totalChangeNotice.set(null);
      // spec 073, FR-001: en el mismo punto donde se resetea `paymentDraft`,
      // se pide al backend el desglose autoritativo del pedido de
      // mostrador/mesa individual que se está cobrando. `untracked` evita que
      // los reads de `pendingCheckout()` amplíen las dependencias de este
      // effect (que solo debe re-correr al cambiar la selección, no en cada
      // sondeo de pedidos — si no, borraría lo que el cajero está tecleando).
      untracked(() => {
        void this.store.loadCheckoutPreview(
          orderId && this.pendingCheckout() ? orderId : null,
        );
      });
    });

    // Recuerda el último total que se le mostró al cajero — base de la
    // comparación de FR-007 justo antes de someter el cobro.
    effect(() => {
      const total = this.store.checkoutPreview()?.total;
      if (total != null && !this.store.checkoutPreviewLoading()) {
        this.lastShownTotal = Number(total);
      }
    });
  }

  async checkout(): Promise<void> {
    // spec 089 (A-96, FR-026): nunca se cobra una cifra que el servidor aún no confirmó.
    if (
      this.store.checkoutPreviewEstimate() !== null ||
      this.store.checkoutPreviewLoading() ||
      this.issue() ||
      !this.preview()
    ) {
      return;
    }
    const orderId = this.store.selectedOrderId();
    const beforeTotal = this.lastShownTotal ?? this.previewTotal();
    this.totalChangeNotice.set(null);

    // spec 073, FR-007 / research.md D11: chequeo determinista antes de someter — se vuelve a pedir
    // el preview. spec 089 (A-96, FR-027/FR-028): si el total cambió por una causa externa ya NO
    // se abre un modal; se actualiza la cifra, se avisa dentro del panel y NO se cobra: el
    // siguiente Cobrar cobra el importe visible (nunca un importe que el cajero no vio).
    if (orderId) {
      await this.store.loadCheckoutPreview(orderId);
    }
    const fresh = this.store.checkoutPreview();
    if (!fresh) return; // el preview falló: no se cobra contra un total no verificado
    const freshTotal = Number(fresh.total);
    if (freshTotal !== beforeTotal) {
      this.lastShownTotal = freshTotal;
      this.totalChangeNotice.set({ now: freshTotal, before: beforeTotal });
      return;
    }
    await this.store.checkoutAndSend(paymentLines(this.paymentDraft(), this.store.paymentMethodsAvailable()));
  }
}
