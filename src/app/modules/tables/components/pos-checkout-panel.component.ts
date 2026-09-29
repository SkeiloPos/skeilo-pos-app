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
import { ConfirmService } from '../../../shared/feedback/confirm.service';
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
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

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
    IconMiComponent,
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
      'w-full flex flex-col border-t border-[#e5e7eb] min-w-0 bg-white lg:w-[40%] lg:shrink-0 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l',
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
            class="mb-3 flex items-center gap-2 rounded-[6px] border border-[#fef3c7] bg-[#fffbeb] px-3 py-2"
          >
            <span class="text-[13px] text-[#92400e] flex-1">La cuenta cambió</span>
            <button
              (click)="store.refreshBill()"
              class="px-2.5 py-1 rounded-[6px] bg-[#d97706] hover:bg-[#b45309] text-white text-[11px] font-semibold transition-colors"
            >
              Actualizar
            </button>
          </div>
        }
        @if (store.billLoading()) {
          <p class="text-[12px] text-[#9ca3af] py-8 text-center">Cargando cuenta…</p>
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
                  <p class="text-[12px] text-[#6b7280]">
                    Aprobar el comprobante o confirmar el pago registra el pedido como una venta en
                    el sistema.
                  </p>
                  <button
                    (click)="store.reload()"
                    class="text-[12px] font-medium text-[#9ca3af] hover:text-[#4f46e5] transition-colors shrink-0"
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
              class="w-full min-h-11 py-2 mt-2 border border-[#fecaca] text-[#b91c1c] rounded-[6px] text-[13px] font-medium hover:bg-[#fef2f2] disabled:opacity-40 transition-colors"
            >
              Rechazar pedido
            </button>
          </div>
        } @else if (store.selectedOrder() || store.pendingOfSelectedTable().length === 0) {
          <!-- Origen mostrador (o mesa sin pedido todavía): cobro editable (T024). -->
          <div class="flex flex-col h-full">
            <h2 class="text-[15px] font-bold text-[#111827] mb-3">
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
                class="w-full py-2.5 bg-[#4f46e5] text-white rounded-[6px] text-[13px] font-semibold hover:bg-[#4338ca] disabled:opacity-40 transition-colors"
              >
                + Crear pedido nuevo
              </button>
            } @else {
              <div class="mb-2">
                <label class="block text-[11px] font-semibold text-[#6b7280] uppercase tracking-wide mb-1"
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
                    class="w-full min-h-11 px-3 py-2 pr-9 border border-[#e5e7eb] rounded-[6px] text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]"
                    [class]="editandoFacturacion() ? '' : 'bg-[#f9fafb] text-[#6b7280]'"
                  />
                  <button
                    type="button"
                    (click)="toggleEditarFacturacion()"
                    title="Editar nombre de facturación"
                    class="absolute right-2 inset-y-0 flex items-center text-[#9ca3af] hover:text-[#4b5563] transition-colors"
                  >
                    <app-mi-icon name="edit" ariaLabel="Editar nombre de facturación" [size]="16" />
                  </button>
                </div>
              </div>

              <!--
                spec 073, FR-002/FR-004: el importe lo calcula el backend
                (checkoutPreview()), nunca el navegador. Desglose agregado
                Subtotal / Descuento / Domicilio / Total, con el mismo formato
                que la cuenta de mesa; Descuento y Domicilio solo si son > 0.
              -->
              @if (preview(); as p) {
                <div class="rounded-[6px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 my-3 space-y-1">
                  <app-bill-summary
                    [subtotal]="+p.subtotal"
                    [discount]="+p.discount"
                    [deliveryFee]="+p.delivery_fee"
                    [total]="+p.total"
                    size="sm"
                  />
                </div>
              } @else {
                <!-- FR-007a: nunca un total provisional — estado "calculando"
                     visible y "Cobrar" deshabilitado hasta recibir el total. -->
                <p class="text-[13px] text-[#9ca3af] py-3 text-center">Calculando el total…</p>
              }

              @if (store.checkoutPreviewStale() && !store.checkoutPreviewLoading()) {
                <div class="mb-3 flex items-center gap-2 rounded-[6px] border border-[#fef3c7] bg-[#fffbeb] px-3 py-2">
                  <span class="text-[13px] text-[#92400e] flex-1">El total cambió</span>
                  <button
                    (click)="store.loadCheckoutPreview(store.selectedOrderId())"
                    class="px-2.5 py-1 rounded-[6px] bg-[#d97706] hover:bg-[#b45309] text-white text-[11px] font-semibold transition-colors"
                  >
                    Actualizar
                  </button>
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
                <div class="bg-[#fef2f2] border border-[#fecaca] rounded-[6px] px-3 py-2 my-3">
                  <p class="text-[13px] text-[#b91c1c]">{{ store.error() }}</p>
                </div>
              }

              <button
                (click)="checkout()"
                [disabled]="store.checkoutSubmitting() || !preview() || store.checkoutPreviewLoading() || issue() !== null"
                class="w-full min-h-11 py-2.5 mt-3 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-[14px] font-semibold rounded-[6px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {{ store.checkoutSubmitting() ? 'Cobrando…' : 'Cobrar' }}
              </button>

              <!-- Spec 029, hotfix #4: alternativa a cobrar, sin venta ni movimiento de caja. -->
              <button
                (click)="store.rejectOrder()"
                [disabled]="store.submitting() || store.checkoutSubmitting()"
                class="w-full min-h-11 py-2 mt-2 border border-[#fecaca] text-[#b91c1c] rounded-[6px] text-[13px] font-medium hover:bg-[#fef2f2] disabled:opacity-40 transition-colors"
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
          <div class="p-3 border-t border-[#e5e7eb] space-y-2 shrink-0">
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
                class="w-full min-h-11 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] font-medium text-[#4b5563] hover:bg-[#f9fafb] transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <app-mi-icon name="receipt" [size]="16" />
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
                class="w-full min-h-11 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] font-medium text-[#4b5563] hover:bg-[#f9fafb] disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <app-mi-icon name="lock_open" [size]="16" />
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
  private readonly confirm = inject(ConfirmService);

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

  /** El total real a cobrar (número), del preview del backend — reemplaza
   *  `store.totals().total` para el pedido de mostrador/mesa individual. */
  readonly previewTotal = computed(() => Number(this.store.checkoutPreview()?.total ?? 0));

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
    if (this.issue() || !this.preview()) return;
    const orderId = this.store.selectedOrderId();
    const beforeTotal = this.lastShownTotal ?? this.previewTotal();

    // spec 073, FR-007 / research.md D11: doble chequeo determinista antes de
    // someter — se vuelve a pedir el preview; si el total cambió respecto al
    // último mostrado, se detiene, se presenta el total nuevo y se exige una
    // segunda confirmación explícita (nunca se deja fallar la request real con
    // el mensaje técnico del servidor).
    if (orderId) {
      await this.store.loadCheckoutPreview(orderId);
    }
    const fresh = this.store.checkoutPreview();
    if (!fresh) return; // el preview falló: no se cobra contra un total no verificado
    const freshTotal = Number(fresh.total);
    if (freshTotal !== beforeTotal) {
      const ok = await this.confirm.ask({
        title: 'El total cambió',
        message:
          `El total a cobrar pasó a ${this.store.fmt(freshTotal)} ` +
          `(antes ${this.store.fmt(beforeTotal)}). ¿Continuar con el cobro por ese importe?`,
        confirmText: 'Sí, cobrar',
      });
      this.lastShownTotal = freshTotal;
      if (!ok) return;
      // El importe tecleado pudo quedar corto (o el campo se reinició al
      // cambiar el total): re-validar antes de someter.
      if (this.issue()) return;
    }
    await this.store.checkoutAndSend(paymentLines(this.paymentDraft()));
  }
}
