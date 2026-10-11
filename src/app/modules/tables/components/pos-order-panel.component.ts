import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PosTerminalStore } from '../services/pos-terminal.store';
import { KitchenStatus, getSidebarMode } from '../interfaces/dining.interface';
import { kitchenStatusClass, kitchenStatusLabel } from '../../orders/order-status.util';
import { PosCatalogDrawerComponent } from './pos-catalog-drawer.component';
import { CartItemOptionsComponent } from './cart-item-options.component';
import { splitVariantLabel } from '../services/menu-lookup';
import { IconMiComponent } from '../../../shared/icon-mi/icon-mi.component';

/**
 * Columna central: armado y edición del pedido de la mesa seleccionada.
 *
 * Spec 045: sin mesa seleccionada, esta es la única responsabilidad de este
 * panel — un placeholder informativo, nada más. Ya no muestra aquí "Pagos
 * por confirmar" (spec 036 FR-004, retirada) — ese listado global se
 * reemplaza por el filtro "Pendientes" de la grilla de mesas más el flujo
 * ya existente por mesa (`payment-validation-block.component.ts`, spec 044).
 */
@Component({
  selector: 'app-pos-order-panel',
  standalone: true,
  imports: [PosCatalogDrawerComponent, CartItemOptionsComponent, IconMiComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // El host es `inline` por defecto: sin esto no se ve como una columna.
  // shrink-0 (no flex-1 min-h-0): a pedido del usuario, el carrito ya no
  // tiene su propio scroll interno -- crece a su alto natural y es la
  // columna de detalle (table-sessions.component.ts) la que scrollea el
  // bloque entero de una sola vez si no alcanza, en vez de que cada caja
  // (carrito, cuenta de la mesa) recorte su contenido por separado.
  host: { class: 'flex flex-col shrink-0' },
  template: `
    @if (!store.hasActiveSelection()) {
      <div
        class="flex-1 flex flex-col items-center justify-center text-center text-[#9ca3af] p-6 gap-2"
      >
        <app-mi-icon name="restaurant" [size]="40" />
        <p class="text-[13px] max-w-xs">
          Selecciona una mesa para ver su pedido, o usa el filtro "Pendientes" de arriba para
          encontrar pagos por confirmar.
        </p>
      </div>
    } @else if (store.selectedTableId() && !store.selectedOrderId()) {
      <!-- Spec 087 (FR-008/FR-009, T014): mesa libre seleccionada, sin ningún
           pedido todavía -- "Agregar producto"/"Guardar pedido" ya no pueden
           crear la orden implícitamente (A-85), así que ofrecer el catálogo
           aquí solo llevaría a un guardado que falla. Se guía directo a
           "Crear pedido manual". -->
      <div
        class="flex-1 flex flex-col items-center justify-center text-center text-[#9ca3af] p-6 gap-2"
      >
        <app-mi-icon name="receipt_long" [size]="40" />
        <p class="text-[13px] max-w-xs">
          Esta mesa todavía no tiene ningún pedido. Usa "Crear pedido manual" para empezar uno.
        </p>
      </div>
    } @else {
      <div class="flex flex-col">
        <!-- Header: mesa + estado + cliente en una sola fila, siempre de solo
             lectura (spec 049, FR-006/FR-008) — el nombre ya no se edita
             desde aquí. -->
        <div class="p-4 border-b border-[#e5e7eb] space-y-2 shrink-0">
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <!-- Insignia numerada: solo tiene sentido con una mesa real
                   (Domicilio/Para llevar no tienen un número que mostrar). -->
              @if (store.selectedTable(); as t) {
                <span
                  class="w-8 h-8 rounded-[6px] bg-[#4f46e5] text-white flex items-center justify-center text-[13px] font-bold shrink-0"
                  >{{ t.number }}</span
                >
              }
              <div class="min-w-0 space-y-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-[16px] font-bold text-[#111827] truncate">{{ headerTitle() }}</h3>
                  @if (store.selectedTableStatusMeta(); as meta) {
                    <span
                      class="px-2 py-0.5 rounded-[6px] text-[11px] font-medium"
                      [class]="meta.chip"
                      >{{ meta.label }}</span
                    >
                  }
                </div>
                <span class="flex items-center gap-1 text-[13px] font-semibold text-[#111827]">
                  <app-mi-icon name="person" [size]="14" class="text-[#4f46e5] shrink-0" />
                  {{ displayCustomerName() }}
                </span>
              </div>
            </div>

            <!-- Columna derecha desde sm (en móvil se apila abajo, a todo el
                 ancho -- 4 pestañas "Pedido N" no caben al lado del nombre del
                 cliente en ~375px sin aplastarlo): pestañas "Pedido N", chip de
                 cobro pendiente y el botón de cerrar, todos en una sola fila
                 junto al botón de cerrar (antes las pestañas iban en su propia
                 fila debajo, separadas de él). -->
            <div class="flex flex-wrap items-center justify-start sm:justify-end gap-1.5 shrink-0">
              @if (store.orderTabs().length > 0) {
                <!-- Spec 049, FR-009: cada "Pedido N" enfoca una sola orden de la
                     mesa. Sin "+ Nuevo pedido" (FR-001, spec 049 — retirado sin
                     reemplazo en este panel). -->
                <div class="flex flex-wrap gap-1.5">
                  @for (ot of store.orderTabs(); track ot.id) {
                    <button
                      (click)="selectOrderTab(ot.id)"
                      class="px-3 py-1.5 text-[12px] font-medium rounded-[6px] border transition-colors"
                      [class]="
                        store.selectedOrderId() === ot.id
                          ? 'border-[#4f46e5] bg-[#4f46e5] text-white'
                          : 'border-[#e5e7eb] text-[#4b5563] hover:bg-[#f9fafb]'
                      "
                    >
                      <!-- A pedido del usuario: un pago QR por confirmar es
                           una pestaña más (ver orderTabs() en el store) --
                           este punto la distingue de un pedido ya
                           consumido/activo de un vistazo, sin pantalla aparte. -->
                      @if (ot.pending) {
                        <span
                          class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                          [class]="store.selectedOrderId() === ot.id ? 'bg-white' : 'bg-amber-500'"
                        ></span>
                      }
                      {{ ot.label }}
                    </button>
                  }
                </div>
              }
              <!-- Mismo dato que ya calculaba headerStatusText() ("pago
                   pendiente"), ahora también como insignia visible de un
                   vistazo -- no se inventa ningún estado nuevo. -->
              @if (headerStatusText() === 'pago pendiente') {
                <span
                  class="px-2.5 py-1 rounded-[6px] bg-[#4f46e5] text-white text-[11px] font-semibold whitespace-nowrap"
                  >Cobro pendiente</span
                >
              }
            </div>
          </div>

          <!-- Spec 059, Historia 3 (FR-012): datos propios de un pedido de
               Domicilio, capturados al crearlo (spec 056) — solo aplica sin
               mesa y con order_type DELIVERY.
               spec 078 (US5, FR-026–FR-030; research.md D6): fila compacta
               (flex flex-wrap) contigua a la insignia de estado, no un bloque
               vertical extenso. La dirección se muestra completa, envolviendo
               (break-words, sin truncate ni line-clamp). El valor del domicilio
               es el mismo delivery_fee que suma el total de la tarjeta (US1).
               shrink-0: parte del reparto de alto de US4. -->
          @if (!store.selectedTable() && store.selectedOrder()?.order_type === 'DELIVERY') {
            <div
              data-testid="delivery-info-row"
              class="text-[12px] text-[#6b7280] flex flex-wrap items-start gap-x-3 gap-y-1 shrink-0"
            >
              <span class="min-w-0 break-words inline-flex items-center gap-1">
                <app-mi-icon name="location_on" [size]="14" />
                {{ store.selectedOrder()?.delivery_address }}
              </span>
              @if (store.selectedOrder()?.delivery_phone; as phone) {
                <span class="whitespace-nowrap inline-flex items-center gap-1">
                  <app-mi-icon name="call" [size]="14" />
                  {{ phone }}
                </span>
              }
              <span class="whitespace-nowrap inline-flex items-center gap-1">
                <app-mi-icon name="delivery_dining" [size]="14" />
                Domicilio: {{ store.fmt(store.selectedOrder()?.delivery_fee ?? 0) }}
              </span>
            </div>
          }
        </div>

        @if (showCatalog()) {
          <!-- Catálogo embebido (spec 036, FR-006/FR-007): reemplaza la lista
               de ítems mientras se agrega un producto, sin overlay de
               pantalla completa — "← Volver" del catálogo regresa aquí sin
               perder lo ya agregado (store.closeCatalog()). -->
          <app-pos-catalog-drawer />
        } @else {
          <!-- Cart: sin scroll propio (a pedido del usuario) -- crece a su
               alto natural; es la columna de detalle
               (table-sessions.component.ts) la que scrollea todo el bloque
               de una sola vez si no alcanza.

               Rediseño de ítems (a pedido del usuario): sin tarjetas
               individuales (bg/border/rounded por ítem) -- una sola lista
               separada por líneas divisorias (divide-y), más compacta y sin
               tanto recuadro repetido. Cada grupo de opciones se muestra con
               su propio nombre (p. ej. "Toppings", "Sabores"), reutilizando
               el mismo que el comensal/mesero vio al elegir -- antes todas
               las opciones (y la nota) iban en una lista plana de "•", sin
               forma de distinguir de qué grupo venía cada una ni qué era
               nota y qué era una opción elegida. -->
          <div class="px-4 divide-y divide-[#e5e7eb]">
            @for (it of cartItems(); track it.key) {
              <!-- Rediseño (a pedido del usuario): insignia de cantidad +
                   nombre/variante en pastillas + precio unitario debajo del
                   nombre + "qty × unitario" debajo del importe -- mismo
                   patrón visual en toda la fila, en vez de una sola línea
                   plana "3x Nombre ... $ Importe". -->
              @let parts = splitVariantLabel(it.name);
              <div class="py-3 flex items-start gap-3">
                <div
                  class="shrink-0 w-9 h-9 rounded-[8px] bg-[#eef2ff] text-[#4f46e5] flex items-center justify-center text-[13px] font-bold"
                >
                  {{ it.qty }}x
                </div>
                <div class="flex-1 min-w-0 space-y-1.5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="font-bold text-[#111827] text-[14px]">{{ parts.product }}</span>
                        @if (parts.variant) {
                          <span
                            class="bg-[#f3f4f6] text-[#4b5563] text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            >{{ parts.variant }}</span
                          >
                        }
                        @if (it.promo; as promo) {
                          <span
                            class="bg-[#fee2e2] text-[#dc2626] text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                            >{{ promo.badge }} Promoción</span
                          >
                        }
                      </div>
                      <div class="text-[11px] text-[#9ca3af]">{{ store.fmt(it.unitPrice) }} c/u</div>
                    </div>
                    <div class="text-right shrink-0">
                      @if (it.promo; as promo) {
                        <div class="font-bold text-[#dc2626] text-[14px]">{{
                          store.fmt(promo.discountedAmount)
                        }}</div>
                      } @else {
                        <div class="font-bold text-[#111827] text-[14px]">{{ store.fmt(it.subtotal) }}</div>
                      }
                      <div class="text-[11px] text-[#9ca3af]">{{ it.qty }} × {{ store.fmt(it.unitPrice) }}</div>
                      @if (it.addonsTotal > 0) {
                        <!-- spec 089 (A-94): adicionales del Menú QR, cobrados una vez por línea. -->
                        <div class="text-[11px] text-[#9ca3af]">+ {{ store.fmt(it.addonsTotal) }} adicionales</div>
                      }
                    </div>
                  </div>
                  @if (it.promo; as promo) {
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="line-through text-[11px] text-[#9ca3af] font-mono">{{
                        store.fmt(promo.originalAmount)
                      }}</span>
                      <span
                        class="inline-flex items-center gap-1 bg-[#ecfdf5] text-[#15803d] border border-[#bbf7d0] text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        ><app-mi-icon name="check" [size]="12" /> Ahorras {{ store.fmt(promo.savings) }}</span
                      >
                    </div>
                  }
                  <!-- Opciones elegidas (agrupadas por el nombre de su grupo,
                       p. ej. "Toppings", "Sabores") + nota de texto libre --
                       reutilizado tal cual en manual-order-page.component.ts. -->
                  <app-cart-item-options [options]="it.options" [notes]="it.notes" />
                  @if (it.kind === 'draft') {
                    <div class="flex items-center justify-between pt-1">
                      <div class="flex items-center gap-2">
                        <button
                          (click)="store.decDraft(it.key)"
                          class="w-7 h-7 rounded-[6px] border border-[#e5e7eb] text-[#4b5563] hover:bg-[#f9fafb] font-bold"
                        >
                          −
                        </button>
                        <span class="w-5 text-center font-bold text-[13px]">{{ it.qty }}</span>
                        <button
                          (click)="store.incDraft(it.key)"
                          class="w-7 h-7 rounded-[6px] border border-[#e5e7eb] text-[#4b5563] hover:bg-[#f9fafb] font-bold"
                        >
                          +
                        </button>
                      </div>
                      <button
                        (click)="store.removeDraft(it.key)"
                        class="text-[11px] font-medium text-[#dc2626] hover:text-[#b91c1c]"
                      >
                        Eliminar
                      </button>
                    </div>
                  } @else if (it.kind === 'persisted') {
                    <div class="flex items-center justify-between pt-1">
                      <div class="flex items-center gap-2 text-[11px]">
                        @if (it.kitchenStatus; as estado) {
                          <span class="px-2 py-0.5 rounded-[6px]" [class]="statusClass(estado)">
                            {{ statusLabel(estado) }}
                          </span>
                        }
                      </div>
                      <div class="flex items-center gap-3">
                        <!-- Marcar listo desde aquí es lo que sustituye al tablero de
                           cocina: quien toma el pedido lo prepara y lo marca sin
                           cambiar de pantalla. Botón outline (borde, sin
                           relleno) -- antes era solo texto con color, sin forma
                           de botón; "Marcar listo" en vez de "✓ Listo" para que
                           el texto ya diga la acción sin depender del ícono. -->
                        @if (!it.ready) {
                          <button
                            (click)="store.avanzarItem(it.key)"
                            [disabled]="store.submitting()"
                            class="px-2.5 py-1 rounded-[6px] border border-[#bbf7d0] text-[11px] font-semibold text-[#15803d] hover:bg-[#f0fdf4] disabled:opacity-50 transition-colors"
                          >
                            Marcar listo
                          </button>
                        }
                        <!-- Un pedido ya pagado se asume entregado: no se anula
                           (spec 029, FR-007). Mismo tratamiento outline que
                           "Marcar listo", en su color de peligro. -->
                        @if (!store.selectedOrder()?.paid) {
                          <button
                            (click)="
                              it.comboId
                                ? store.voidPersistedCombo(it.comboId)
                                : store.voidPersistedItem(it.key)
                            "
                            class="px-2.5 py-1 rounded-[6px] border border-[#fecaca] text-[11px] font-medium text-[#dc2626] hover:bg-[#fef2f2] transition-colors"
                          >
                            Anular
                          </button>
                        }
                      </div>
                    </div>
                  }
                  <!-- 'pending-review' (pago QR sin confirmar): sin fila de
                       acciones -- el pedido todavía no se envió a cocina (eso
                       pasa recién al confirmar el pago, desde
                       app-pos-checkout-panel a la derecha), así que no hay
                       nada que anular ni marcar listo desde aquí todavía. -->
                </div>
              </div>
            }
            @if (cartIsEmpty()) {
              <div class="text-center text-[#9ca3af] py-10 text-[13px]">
                Aún no hay productos en este pedido.
              </div>
            }
          </div>
          @if (!readOnly() && store.centralState() !== 'ocupada-sin-pedido') {
            <!--
              Fuera del divide-y de la lista (a propósito): con un borde
              propio en las 4 caras, si quedara adentro le sumaría el
              border-t de divide-y encima, una línea doble justo arriba.

              Spec 110: oculto cuando centralState() es 'ocupada-sin-pedido'
              -- esta mesa ya tiene sesión abierta sin ningún pedido vivo, y
              la única acción que debe verse en el panel de detalle es
              "Liberar Mesa" (pos-checkout-panel.component.ts); crear un
              pedido nuevo en esa mesa sigue disponible desde el CTA de la
              sub-barra ("+ Crear pedido nuevo" / F3), que no se toca.
            -->
            <div class="px-4 pb-4" [class]="cartIsEmpty() ? '' : 'pt-3'">
              <button
                (click)="store.openCatalog()"
                class="w-full py-2.5 border border-[#e5e7eb] rounded-[6px] text-[13px] font-medium text-[#4b5563] hover:bg-[#f9fafb] flex items-center justify-center gap-1"
              >
                ＋ Agregar producto
              </button>
            </div>
          }

          <!-- Spec 049, FR-002: el resumen Subtotal/Descuento/Total se retiró
               de este panel — vive ahora en session-bill-panel.component.ts
               ("Cuenta de la mesa"). "Guardar pedido" no es de cobro, así que
               se queda aquí, solo sin el contenedor de totales alrededor.
               spec 078 (US4, FR-023): fuera de la lista scrolleable, shrink-0 —
               siempre alcanzable. "Marcar pedido listo" ya no vive aquí -- se
               subió a la cabecera, a la derecha de "Mesa N" (a pedido del
               usuario). -->
          @if (store.hasDraft()) {
            <div class="p-4 pt-3 border-t border-[#e5e7eb] shrink-0">
              <button
                (click)="store.saveOrder()"
                [disabled]="store.submitting()"
                class="w-full py-2.5 bg-[#4f46e5] text-white rounded-[6px] text-[13px] font-semibold hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
              >
                {{ store.submitting() ? 'Guardando…' : 'Guardar pedido' }}
              </button>
            </div>
          }
        }
      </div>
    }
  `,
})
export class PosOrderPanelComponent {
  readonly store = inject(PosTerminalStore);

  /**
   * Ítems del pedido seleccionado -- incluido un pago QR por confirmar,
   * ahora que `selectTable()`/`orderTabs()` ya lo seleccionan como cualquier
   * otro pedido (a pedido del usuario). `store.cartView()` ya marca sus
   * ítems `kind: 'pending-review'` (ver `selectedOrderPending()` en el
   * store), así que este panel no necesita distinguir el caso aquí.
   */
  readonly cartItems = computed(() => this.store.cartView());

  readonly cartIsEmpty = computed(() => this.cartItems().length === 0);

  /** spec 087 (FR-004, A-88): el nombre del cliente se destaca en la
   *  cabecera del pedido -- "Cliente sin nombre" solo para pedidos
   *  históricos anteriores a esta spec (`customer_name` nulo/vacío), nunca
   *  migrados. */
  readonly displayCustomerName = computed(
    () => this.store.customerName().trim() || 'Cliente sin nombre',
  );

  /** Spec 036, US2, escenario 5: mismo criterio que ya usa
   *  `pos-checkout-panel.component.ts` para su propio modo de solo lectura
   *  (`getSidebarMode`, `dining.interface.ts`) — una orden QR (pagada o
   *  todavía por confirmar) no ofrece "+ Agregar producto". */
  readonly readOnly = computed(() => getSidebarMode(this.store.selectedOrder()) === 'resumen');

  /** Catálogo embebido visible (spec 036, FR-006/FR-007): nunca en modo de
   *  solo lectura, aunque `catalogOpen()` hubiera quedado en `true` de una
   *  orden distinta seleccionada antes en la misma mesa. */
  readonly showCatalog = computed(() => this.store.catalogOpen() && !this.readOnly());

  /** Elegir una pestaña "Pedido N" sale de la vista agregada y enfoca ese
   *  pedido (spec 049, D5) — reusa `selectOrder()` tal cual. */
  selectOrderTab(orderId: string): void {
    this.store.showAllOrders.set(false);
    this.store.selectOrder(orderId);
  }

  /**
   * Spec 029, Historia 3: "listo para cobrar" exige pago Y cocina, las dos a
   * la vez — antes solo miraba `kitchenReady()`. `kitchenReady()` en sí no
   * cambia: sigue controlando, sin relación con el pago, cuándo se oculta
   * el botón "Marcar pedido listo".
   */
  headerStatusText(): string {
    if (!this.store.kitchenReady()) return 'en preparación';
    return this.store.selectedOrder()?.paid ? 'listo para cobrar' : 'pago pendiente';
  }

  /**
   * Spec 059, Historia 3: título de la cabecera — "Mesa N" con mesa
   * seleccionada (sin cambios), o el tipo de pedido sin mesa
   * ("Domicilio"/"Para llevar") cuando se seleccionó desde su tarjeta.
   */
  headerTitle(): string {
    const table = this.store.selectedTable();
    if (table) return 'Mesa ' + table.number;
    return this.store.selectedOrder()?.order_type === 'DELIVERY' ? 'Domicilio' : 'Para llevar';
  }

  /** Las mismas etiquetas que ve el comensal en el menú del QR. */
  statusLabel(status: KitchenStatus): string {
    return kitchenStatusLabel(status);
  }

  statusClass(status: KitchenStatus): string {
    return kitchenStatusClass(status);
  }

  /** Separa el nombre del producto de su variante -- ver `splitVariantLabel()` en `menu-lookup.ts`. */
  splitVariantLabel = splitVariantLabel;
}
